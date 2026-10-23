import { expiryFrom, query } from './meta.ts';
import { ProviderError, type FetchFn, type PostMetrics, type Provider, type ProviderAccount, type ProviderEnv, type ProviderPost, type RateUsage, type TokenSet } from './types.ts';

/**
 * YouTube Data API v3 with Google OAuth: the channel, its uploads with public counts, and youtube.upload so the
 * local studio can send approved videos. The upload itself happens on the studio's machine (the long file lives
 * there); the Fábrica only hands it a fresh access token for the approved job.
 * Videos uploaded by an API project that has not passed Google's audit stay private until the owner opens them.
 * https://developers.google.com/youtube/v3/docs
 */
export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.upload'];

const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Google access tokens last 1 hour: refreshed when less than 10 minutes are left. */
const REFRESH_WINDOW_MS = 10 * 60 * 1000;
const MAX_PAGES = 4;
const PAGE_SIZE = 50;

interface GoogleTokenBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface YtChannel {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface YtVideo {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

interface YtList<T> {
  items?: T[];
  nextPageToken?: string;
}

interface YtErrorBody {
  error?: { code?: number; errors?: { reason?: string }[] };
}

const count = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const bestThumbnail = (thumbnails: Record<string, { url?: string }> | undefined): string | null =>
  thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;

export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Public counts of a video. Hidden likes come without likeCount: missing, never zero. */
export function ytPostMetrics(video: YtVideo): PostMetrics {
  const metrics: PostMetrics = {};
  const views = count(video.statistics?.viewCount);
  const likes = count(video.statistics?.likeCount);
  const comments = count(video.statistics?.commentCount);
  if (views !== undefined) metrics.views = views;
  if (likes !== undefined) metrics.likes = likes;
  if (comments !== undefined) metrics.comments = comments;
  return metrics;
}

export function ytPost(video: YtVideo): ProviderPost {
  const title = video.snippet?.title ?? '';
  const description = video.snippet?.description ?? '';
  return {
    externalId: video.id,
    permalink: youtubeWatchUrl(video.id),
    caption: description ? `${title}\n${description}` : title,
    mediaType: 'video',
    thumbnailUrl: bestThumbnail(video.snippet?.thumbnails),
    publishedAt: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt).toISOString() : null,
    metrics: ytPostMetrics(video),
  };
}

export function ytAccount(channel: YtChannel): ProviderAccount {
  const stats = channel.statistics ?? {};
  const followers = stats.hiddenSubscriberCount ? undefined : count(stats.subscriberCount);
  const views = count(stats.viewCount);
  const posts = count(stats.videoCount);
  return {
    externalId: channel.id,
    username: channel.snippet?.customUrl ?? '',
    displayName: channel.snippet?.title ?? channel.snippet?.customUrl ?? '',
    avatarUrl: bestThumbnail(channel.snippet?.thumbnails),
    metrics: {
      ...(followers !== undefined ? { followers } : {}),
      ...(views !== undefined ? { views } : {}),
      ...(posts !== undefined ? { posts } : {}),
    },
  };
}

/** A token response keeps the refresh token it had: Google only sends one on the first consent. */
export function googleTokens(body: GoogleTokenBody, now: Date, previousRefresh: string | null = null): TokenSet {
  if (!body.access_token) {
    if (body.error === 'invalid_grant') throw new ProviderError('auth', 'O Google recusou a autorização. Reconecta o canal.');
    throw new ProviderError('unavailable', `O Google recusou o pedido de token (${body.error ?? 'sem código'}).`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previousRefresh,
    expiresAt: expiryFrom(body.expires_in, now),
    // Google does not say when a refresh token ends (7 days while the app is in "Testing").
    refreshExpiresAt: null,
    scopes: (body.scope ?? '').split(' ').map((scope) => scope.trim()).filter(Boolean),
  };
}

/** Google's error reasons in the Fábrica's words: quota, permission or authorization. */
export function youtubeError(status: number, body: YtErrorBody): ProviderError {
  const reasons = (body.error?.errors ?? []).map((item) => item.reason ?? '');
  if (reasons.some((reason) => reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') || status === 429) {
    return new ProviderError('rate_limit', 'Cota diária da API do YouTube atingida. A próxima tentativa é depois que ela renovar.');
  }
  if (status === 401 || reasons.includes('authError')) return new ProviderError('auth', 'A autorização do YouTube expirou. Reconecta o canal.');
  if (reasons.includes('insufficientPermissions') || reasons.includes('forbidden') || status === 403) {
    return new ProviderError('permission', 'O canal não deu a permissão pedida. Reconecta e aceita ver e enviar vídeos.');
  }
  return new ProviderError('unavailable', `O YouTube recusou a chamada (HTTP ${status}${reasons[0] ? `, ${reasons[0]}` : ''}).`);
}

export function createYouTubeProvider(env: ProviderEnv, fetchFn: FetchFn, now: () => Date = () => new Date()): Provider {
  const clientId = env.get('YOUTUBE_CLIENT_ID') ?? '';
  const clientSecret = env.get('YOUTUBE_CLIENT_SECRET') ?? '';
  let limited = false;

  const tokenCall = async (params: Record<string, string>, previousRefresh: string | null): Promise<TokenSet> => {
    const response = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    }).catch(() => {
      throw new ProviderError('unavailable', 'O Google não respondeu.');
    });
    return googleTokens((await response.json().catch(() => ({}))) as GoogleTokenBody, now(), previousRefresh);
  };

  const api = async <T>(path: string, token: string): Promise<T> => {
    const response = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {
      throw new ProviderError('unavailable', 'O YouTube não respondeu.');
    });
    const body = (await response.json().catch(() => ({}))) as T & YtErrorBody;
    if (response.ok && !body.error) return body;
    const error = youtubeError(response.status, body);
    if (error.kind === 'rate_limit') limited = true;
    throw error;
  };

  const channels = async (tokens: TokenSet, ids?: string): Promise<YtChannel[]> => {
    const params = { part: 'snippet,statistics,contentDetails', ...(ids ? { id: ids } : { mine: 'true' }) };
    return (await api<YtList<YtChannel>>(`/channels?${query(params)}`, tokens.accessToken)).items ?? [];
  };

  return {
    platform: 'youtube',
    requiredSecrets: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    scopes: YOUTUBE_SCOPES,

    // offline + consent: Google only gives a refresh token with both, and the consent screen lets her pick the brand channel.
    authorizeUrl(state, redirectUri) {
      return `https://accounts.google.com/o/oauth2/v2/auth?${query({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: YOUTUBE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent select_account',
        include_granted_scopes: 'true',
        state,
      })}`;
    },

    async exchangeCode(code, redirectUri) {
      const tokens = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }, null);
      const found = await channels(tokens);
      if (!found.length) throw new ProviderError('permission', 'Essa conta do Google não tem canal no YouTube. Cria o canal e conecta de novo.');
      return found.map((channel) => ({ account: ytAccount(channel), tokens }));
    },

    async refresh(tokens, at) {
      if (tokens.expiresAt && tokens.expiresAt.getTime() - at.getTime() > REFRESH_WINDOW_MS) return null;
      if (!tokens.refreshToken) throw new ProviderError('auth', 'A autorização do YouTube venceu. Reconecta o canal.');
      return tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, tokens.refreshToken);
    },

    async fetchAccount(tokens, externalId) {
      const [channel] = await channels(tokens, externalId);
      if (!channel) throw new ProviderError('permission', 'O canal não está mais acessível com essa autorização. Reconecta.');
      return ytAccount(channel);
    },

    async fetchPosts(tokens, externalId, since) {
      const [channel] = await channels(tokens, externalId);
      const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];
      const ids: string[] = [];
      let pageToken: string | undefined;
      collect: for (let page = 0; page < MAX_PAGES; page += 1) {
        const list = await api<YtList<{ contentDetails?: { videoId?: string; videoPublishedAt?: string } }>>(
          `/playlistItems?${query({ part: 'contentDetails', playlistId: uploads, maxResults: PAGE_SIZE, pageToken })}`,
          tokens.accessToken,
        );
        for (const item of list.items ?? []) {
          const published = item.contentDetails?.videoPublishedAt;
          if (published && new Date(published).getTime() < since.getTime()) break collect;
          if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
        }
        if (!list.nextPageToken) break;
        pageToken = list.nextPageToken;
      }
      const posts: ProviderPost[] = [];
      for (let start = 0; start < ids.length; start += PAGE_SIZE) {
        const batch = ids.slice(start, start + PAGE_SIZE);
        const videos = await api<YtList<YtVideo>>(`/videos?${query({ part: 'snippet,statistics', id: batch.join(','), maxResults: PAGE_SIZE })}`, tokens.accessToken);
        posts.push(...(videos.items ?? []).map(ytPost));
      }
      return posts.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    },

    async revoke(tokens) {
      await fetchFn(`https://oauth2.googleapis.com/revoke?${query({ token: tokens.refreshToken ?? tokens.accessToken })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    },

    usage: (): RateUsage => ({ percent: null, limited, checkedAt: now().toISOString() }),
  };
}
