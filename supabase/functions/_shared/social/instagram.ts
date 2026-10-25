import { DEFAULT_GRAPH_VERSION, expiryFrom, insightValues, MetaClient, query } from './meta.ts';
import { ProviderError, type FetchFn, type MediaType, type PostMetrics, type Provider, type ProviderAccount, type ProviderEnv, type ProviderPost, type TokenSet } from './types.ts';

/**
 * Instagram API with Instagram Login (professional accounts: business or creator), no Facebook page needed.
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights', 'instagram_business_content_publish'];
const INSIGHTS_SCOPE = 'instagram_business_manage_insights';

/**
 * Insights (views, reach, saves, shares) need a permission the Meta may take long to grant. Without it the login
 * asks only for basic + publishing; turn it on with INSTAGRAM_INSIGHTS=on once the app has it, and reconnect.
 */
export const instagramScopes = (insights: string | undefined): string[] =>
  insights === 'on' ? INSTAGRAM_SCOPES : INSTAGRAM_SCOPES.filter((scope) => scope !== INSIGHTS_SCOPE);

/** Long-lived tokens last 60 days; refreshing 10 days before keeps a margin for failed syncs. */
const REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 5;

interface IgMedia {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

/** Metrics feed posts, carousels and reels accept (asking for one a media does not support fails the whole call). */
const MEDIA_INSIGHTS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved'];

export function igMediaType(media: Pick<IgMedia, 'media_type' | 'media_product_type'>): MediaType {
  if (media.media_product_type === 'REELS') return 'reel';
  if (media.media_product_type === 'STORY') return 'story';
  if (media.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (media.media_type === 'VIDEO') return 'video';
  return media.media_type === 'IMAGE' ? 'image' : 'other';
}

/** Insights names → Fábrica keys. Like and comment counts from the media fields fill in when insights are refused. */
export function igPostMetrics(media: IgMedia, insights: Record<string, number> | null): PostMetrics {
  const metrics: PostMetrics = {};
  if (typeof media.like_count === 'number') metrics.likes = media.like_count;
  if (typeof media.comments_count === 'number') metrics.comments = media.comments_count;
  if (!insights) return metrics;
  if (insights.views !== undefined) metrics.views = insights.views;
  if (insights.reach !== undefined) metrics.reach = insights.reach;
  if (insights.likes !== undefined) metrics.likes = insights.likes;
  if (insights.comments !== undefined) metrics.comments = insights.comments;
  if (insights.shares !== undefined) metrics.shares = insights.shares;
  if (insights.saved !== undefined) metrics.saves = insights.saved;
  return metrics;
}

export function igPost(media: IgMedia, insights: Record<string, number> | null): ProviderPost {
  return {
    externalId: media.id,
    permalink: media.permalink ?? null,
    caption: media.caption ?? '',
    mediaType: igMediaType(media),
    // Video and reels covers come in thumbnail_url; images and carousels in media_url (first item).
    thumbnailUrl: media.thumbnail_url ?? (media.media_type === 'VIDEO' ? null : (media.media_url ?? null)),
    publishedAt: media.timestamp ? new Date(media.timestamp).toISOString() : null,
    metrics: igPostMetrics(media, insights),
  };
}

export function createInstagramProvider(env: ProviderEnv, fetchFn: FetchFn, now: () => Date = () => new Date()): Provider {
  const clientId = env.get('INSTAGRAM_APP_ID') ?? '';
  const clientSecret = env.get('INSTAGRAM_APP_SECRET') ?? '';
  const version = env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION;
  const graph = `https://graph.instagram.com/${version}`;
  const scopes = instagramScopes(env.get('INSTAGRAM_INSIGHTS'));
  const client = new MetaClient(fetchFn, now);

  const longLived = async (shortToken: string): Promise<TokenSet> => {
    const body = await client.get<{ access_token: string; expires_in?: number }>(
      `https://graph.instagram.com/access_token?${query({ grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortToken })}`,
    );
    return { accessToken: body.access_token, refreshToken: null, expiresAt: expiryFrom(body.expires_in, now()), refreshExpiresAt: null, scopes: [] };
  };

  const fetchAccount = async (tokens: TokenSet): Promise<ProviderAccount> => {
    const me = await client.get<{ user_id?: string; id?: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number }>(
      `${graph}/me?${query({ fields: 'user_id,username,name,profile_picture_url,followers_count,media_count', access_token: tokens.accessToken })}`,
    );
    const externalId = me.user_id ?? me.id;
    if (!externalId) throw new ProviderError('unavailable', 'O Instagram não devolveu o id da conta.');
    return {
      externalId,
      username: me.username ?? '',
      displayName: me.name ?? me.username ?? '',
      avatarUrl: me.profile_picture_url ?? null,
      metrics: {
        ...(typeof me.followers_count === 'number' ? { followers: me.followers_count } : {}),
        ...(typeof me.media_count === 'number' ? { posts: me.media_count } : {}),
      },
    };
  };

  const mediaInsights = async (media: IgMedia, token: string): Promise<Record<string, number> | null> => {
    if (media.media_product_type === 'STORY' || media.media_product_type === 'AD') return null;
    try {
      return insightValues(await client.get(`${graph}/${media.id}/insights?${query({ metric: MEDIA_INSIGHTS.join(','), access_token: token })}`));
    } catch (error) {
      // Posts from before the account became professional have no insights: the counts from the media still count.
      if (error instanceof ProviderError && error.kind === 'permission') return null;
      throw error;
    }
  };

  return {
    platform: 'instagram',
    requiredSecrets: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
    scopes,

    authorizeUrl(state, redirectUri) {
      return `https://www.instagram.com/oauth/authorize?${query({
        enable_fb_login: 0,
        force_authentication: 1,
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(','),
        state,
      })}`;
    },

    async exchangeCode(code, redirectUri) {
      // Instagram appends "#_" to the code in the redirect.
      const cleanCode = code.replace(/#_$/, '');
      const body = await client.post<{ access_token?: string; permissions?: string | string[]; data?: { access_token: string; permissions?: string | string[] }[] }>(
        'https://api.instagram.com/oauth/access_token',
        new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code: cleanCode }),
      );
      const short = body.data?.[0] ?? body;
      if (!short.access_token) throw new ProviderError('auth', 'O Instagram não devolveu o token.');
      const permissions = Array.isArray(short.permissions) ? short.permissions : (short.permissions ?? '').split(',').filter(Boolean);
      const tokens = { ...(await longLived(short.access_token)), scopes: permissions };
      return [{ account: await fetchAccount(tokens), tokens }];
    },

    async refresh(tokens, at) {
      if (!tokens.expiresAt || tokens.expiresAt.getTime() - at.getTime() > REFRESH_WINDOW_MS) return null;
      if (tokens.expiresAt.getTime() <= at.getTime()) throw new ProviderError('auth', 'O token do Instagram venceu. Reconecta a conta.');
      const body = await client.get<{ access_token: string; expires_in?: number }>(
        `https://graph.instagram.com/refresh_access_token?${query({ grant_type: 'ig_refresh_token', access_token: tokens.accessToken })}`,
      );
      return { ...tokens, accessToken: body.access_token, expiresAt: expiryFrom(body.expires_in, at) };
    },

    fetchAccount: (tokens) => fetchAccount(tokens),

    async fetchPosts(tokens, _externalId, since) {
      const posts: ProviderPost[] = [];
      let url: string | null = `${graph}/me/media?${query({
        fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
        limit: 50,
        access_token: tokens.accessToken,
      })}`;
      for (let page = 0; url && page < MAX_PAGES; page += 1) {
        const body: { data?: IgMedia[]; paging?: { next?: string } } = await client.get(url);
        let reachedOld = false;
        for (const media of body.data ?? []) {
          if (media.timestamp && new Date(media.timestamp) < since) {
            reachedOld = true;
            break;
          }
          posts.push(igPost(media, await mediaInsights(media, tokens.accessToken)));
        }
        url = reachedOld ? null : (body.paging?.next ?? null);
      }
      return posts;
    },

    async revoke() {
      // Instagram Login has no revoke endpoint: removing the app in the Instagram settings ends the authorization.
    },

    usage: () => client.usage(),
  };
}
