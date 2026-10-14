import { expiryFrom, query } from './meta.ts';
import { ProviderError, type FetchFn, type PostMetrics, type Provider, type ProviderAccount, type ProviderEnv, type ProviderPost, type RateUsage, type TokenSet } from './types.ts';

/**
 * TikTok Login Kit + Display API: the profile and the videos of the authorized account with their public counts.
 * The app must be approved by TikTok with these scopes before anyone outside the sandbox can connect.
 * https://developers.tiktok.com/doc/display-api-overview
 */
export const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'];

const API = 'https://open.tiktokapis.com/v2';
/** Access tokens last 24 hours: every sync refreshes when less than 2 hours are left. */
const REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_PAGES = 5;

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

interface TikTokTokenBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** TikTok reports views as plays of the video ("view_count"); there is no reach nor saves in the Display API. */
export function tiktokPostMetrics(video: TikTokVideo): PostMetrics {
  const metrics: PostMetrics = {};
  if (typeof video.view_count === 'number') metrics.views = video.view_count;
  if (typeof video.like_count === 'number') metrics.likes = video.like_count;
  if (typeof video.comment_count === 'number') metrics.comments = video.comment_count;
  if (typeof video.share_count === 'number') metrics.shares = video.share_count;
  return metrics;
}

export function tiktokPost(video: TikTokVideo): ProviderPost {
  return {
    externalId: video.id,
    permalink: video.share_url ?? null,
    caption: video.video_description ?? video.title ?? '',
    mediaType: 'video',
    thumbnailUrl: video.cover_image_url ?? null,
    publishedAt: typeof video.create_time === 'number' ? new Date(video.create_time * 1000).toISOString() : null,
    metrics: tiktokPostMetrics(video),
  };
}

export function tiktokTokens(body: TikTokTokenBody, now: Date): TokenSet {
  if (!body.access_token) throw tokenError(body);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: expiryFrom(body.expires_in, now),
    refreshExpiresAt: expiryFrom(body.refresh_expires_in, now),
    scopes: (body.scope ?? '').split(',').map((scope) => scope.trim()).filter(Boolean),
  };
}

function tokenError(body: TikTokTokenBody): ProviderError {
  if (body.error === 'invalid_grant' || body.error === 'access_denied') return new ProviderError('auth', 'O TikTok recusou a autorização. Reconecta a conta.');
  if (body.error === 'rate_limit_exceeded') return new ProviderError('rate_limit', 'Limite de chamadas do TikTok atingido.');
  return new ProviderError('unavailable', `O TikTok recusou o pedido de token (${body.error ?? 'sem código'}).`);
}

export function createTikTokProvider(env: ProviderEnv, fetchFn: FetchFn, now: () => Date = () => new Date()): Provider {
  const clientKey = env.get('TIKTOK_CLIENT_KEY') ?? '';
  const clientSecret = env.get('TIKTOK_CLIENT_SECRET') ?? '';
  let limited = false;

  const tokenCall = async (params: Record<string, string>): Promise<TokenSet> => {
    const response = await fetchFn(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }),
    }).catch(() => {
      throw new ProviderError('unavailable', 'O TikTok não respondeu.');
    });
    if (response.status === 429) limited = true;
    return tiktokTokens((await response.json().catch(() => ({}))) as TikTokTokenBody, now());
  };

  const api = async <T>(path: string, token: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetchFn(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } }).catch(() => {
      throw new ProviderError('unavailable', 'O TikTok não respondeu.');
    });
    const body = (await response.json().catch(() => ({}))) as TikTokEnvelope<T>;
    const code = body.error?.code ?? (response.ok ? 'ok' : `http_${response.status}`);
    if (code === 'ok' && body.data) return body.data;
    if (response.status === 429 || code === 'rate_limit_exceeded') {
      limited = true;
      throw new ProviderError('rate_limit', 'Limite de chamadas do TikTok atingido. A próxima sincronização tenta de novo.');
    }
    if (code === 'access_token_invalid' || response.status === 401) throw new ProviderError('auth', 'A autorização do TikTok expirou. Reconecta a conta.');
    if (code === 'scope_not_authorized' || code === 'scope_permission_missed') throw new ProviderError('permission', 'Falta uma permissão do TikTok. Reconecta e aceita todas.');
    throw new ProviderError('unavailable', `O TikTok recusou a chamada (${code}).`);
  };

  const fetchAccount = async (tokens: TokenSet): Promise<ProviderAccount> => {
    const data = await api<{ user?: { open_id?: string; avatar_url?: string; display_name?: string; username?: string; follower_count?: number; video_count?: number } }>(
      `/user/info/?${query({ fields: 'open_id,avatar_url,display_name,username,follower_count,video_count' })}`,
      tokens.accessToken,
    );
    const user = data.user ?? {};
    if (!user.open_id) throw new ProviderError('unavailable', 'O TikTok não devolveu o id da conta.');
    return {
      externalId: user.open_id,
      username: user.username ?? '',
      displayName: user.display_name ?? user.username ?? '',
      avatarUrl: user.avatar_url ?? null,
      metrics: {
        ...(typeof user.follower_count === 'number' ? { followers: user.follower_count } : {}),
        ...(typeof user.video_count === 'number' ? { posts: user.video_count } : {}),
      },
    };
  };

  return {
    platform: 'tiktok',
    requiredSecrets: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    scopes: TIKTOK_SCOPES,

    authorizeUrl(state, redirectUri) {
      return `https://www.tiktok.com/v2/auth/authorize/?${query({ client_key: clientKey, response_type: 'code', scope: TIKTOK_SCOPES.join(','), redirect_uri: redirectUri, state })}`;
    },

    async exchangeCode(code, redirectUri) {
      const tokens = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
      return [{ account: await fetchAccount(tokens), tokens }];
    },

    async refresh(tokens, at) {
      if (tokens.expiresAt && tokens.expiresAt.getTime() - at.getTime() > REFRESH_WINDOW_MS) return null;
      if (!tokens.refreshToken || (tokens.refreshExpiresAt && tokens.refreshExpiresAt <= at)) throw new ProviderError('auth', 'A autorização do TikTok venceu. Reconecta a conta.');
      return tokenCall({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
    },

    fetchAccount: (tokens) => fetchAccount(tokens),

    async fetchPosts(tokens, _externalId, since) {
      const posts: ProviderPost[] = [];
      let cursor: number | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data: { videos?: TikTokVideo[]; cursor?: number; has_more?: boolean } = await api(
          `/video/list/?${query({ fields: 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count' })}`,
          tokens.accessToken,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) },
        );
        const videos = data.videos ?? [];
        for (const video of videos) {
          if (typeof video.create_time === 'number' && video.create_time * 1000 < since.getTime()) return posts;
          posts.push(tiktokPost(video));
        }
        if (!data.has_more || !data.cursor) break;
        cursor = data.cursor;
      }
      return posts;
    },

    async revoke(tokens) {
      await fetchFn(`${API}/oauth/revoke/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: tokens.accessToken }),
      });
    },

    usage: (): RateUsage => ({ percent: null, limited, checkedAt: now().toISOString() }),
  };
}
