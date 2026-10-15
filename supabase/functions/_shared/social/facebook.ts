import { DEFAULT_GRAPH_VERSION, expiryFrom, insightValues, MetaClient, query } from './meta.ts';
import { ProviderError, type FetchFn, type MediaType, type PostMetrics, type Provider, type ProviderAccount, type ProviderEnv, type ProviderPost, type TokenSet } from './types.ts';

/**
 * Facebook pages we manage, through Facebook Login and the Graph API. One login can bring several pages;
 * each page becomes its own connection with its own page token (page tokens from a long-lived user token do not expire).
 */
export const FACEBOOK_SCOPES = ['pages_show_list', 'pages_read_engagement', 'read_insights', 'pages_manage_posts'];

const MAX_PAGES = 4;
/** Newer view metrics first; the older impression metrics only when Meta refuses the new names. */
const POST_INSIGHT_SETS = [
  { metrics: ['post_media_view', 'post_total_media_view_unique'], views: 'post_media_view', reach: 'post_total_media_view_unique' },
  { metrics: ['post_impressions', 'post_impressions_unique'], views: 'post_impressions', reach: 'post_impressions_unique' },
] as const;

interface FbPage {
  id: string;
  name?: string;
  username?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  followers_count?: number;
  fan_count?: number;
  tasks?: string[];
}

interface FbPost {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  attachments?: { data?: { media_type?: string; type?: string }[] };
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

export function fbMediaType(post: FbPost): MediaType {
  const attachment = post.attachments?.data?.[0];
  const kind = `${attachment?.type ?? ''} ${attachment?.media_type ?? ''} ${post.status_type ?? ''}`.toLowerCase();
  if (kind.includes('album')) return 'carousel';
  if (kind.includes('reel')) return 'reel';
  if (kind.includes('video')) return 'video';
  if (kind.includes('photo')) return 'image';
  return attachment ? 'other' : 'text';
}

/** Reactions count as likes (Facebook has no separate like count for pages through this API). */
export function fbPostMetrics(post: FbPost, insights: { views?: number; reach?: number } | null): PostMetrics {
  const metrics: PostMetrics = {};
  if (typeof post.reactions?.summary?.total_count === 'number') metrics.likes = post.reactions.summary.total_count;
  if (typeof post.comments?.summary?.total_count === 'number') metrics.comments = post.comments.summary.total_count;
  // Meta omits `shares` when nobody shared: with the field asked for, missing means zero.
  metrics.shares = post.shares?.count ?? 0;
  if (insights?.views !== undefined) metrics.views = insights.views;
  if (insights?.reach !== undefined) metrics.reach = insights.reach;
  return metrics;
}

export function fbPost(post: FbPost, insights: { views?: number; reach?: number } | null): ProviderPost {
  return {
    externalId: post.id,
    permalink: post.permalink_url ?? null,
    caption: post.message ?? '',
    mediaType: fbMediaType(post),
    thumbnailUrl: post.full_picture ?? null,
    publishedAt: post.created_time ? new Date(post.created_time).toISOString() : null,
    metrics: fbPostMetrics(post, insights),
  };
}

export function fbPageAccount(page: FbPage): ProviderAccount {
  const followers = page.followers_count ?? page.fan_count;
  return {
    externalId: page.id,
    username: page.username ?? '',
    displayName: page.name ?? '',
    avatarUrl: page.picture?.data?.url ?? null,
    metrics: typeof followers === 'number' ? { followers } : {},
  };
}

export function createFacebookProvider(env: ProviderEnv, fetchFn: FetchFn, now: () => Date = () => new Date()): Provider {
  const clientId = env.get('FACEBOOK_APP_ID') ?? '';
  const clientSecret = env.get('FACEBOOK_APP_SECRET') ?? '';
  const version = env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION;
  const graph = `https://graph.facebook.com/${version}`;
  const client = new MetaClient(fetchFn, now);
  /** Index of the insight names that worked last; Meta keeps one set per API version. */
  let insightSet = 0;

  const postInsights = async (postId: string, token: string): Promise<{ views?: number; reach?: number } | null> => {
    for (let index = insightSet; index < POST_INSIGHT_SETS.length; index += 1) {
      const set = POST_INSIGHT_SETS[index];
      try {
        const values = insightValues(await client.get(`${graph}/${postId}/insights?${query({ metric: set.metrics.join(','), access_token: token })}`));
        insightSet = index;
        return { views: values[set.views], reach: values[set.reach] };
      } catch (error) {
        if (!(error instanceof ProviderError) || error.kind !== 'permission') throw error;
      }
    }
    return null;
  };

  return {
    platform: 'facebook',
    requiredSecrets: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    scopes: FACEBOOK_SCOPES,

    authorizeUrl(state, redirectUri) {
      return `https://www.facebook.com/${version}/dialog/oauth?${query({ client_id: clientId, redirect_uri: redirectUri, state, response_type: 'code', scope: FACEBOOK_SCOPES.join(',') })}`;
    },

    async exchangeCode(code, redirectUri) {
      const short = await client.get<{ access_token: string }>(
        `${graph}/oauth/access_token?${query({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code })}`,
      );
      const long = await client.get<{ access_token: string; expires_in?: number }>(
        `${graph}/oauth/access_token?${query({ grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret, fb_exchange_token: short.access_token })}`,
      );
      const permissions = await client.get<{ data?: { permission: string; status: string }[] }>(`${graph}/me/permissions?${query({ access_token: long.access_token })}`);
      const scopes = (permissions.data ?? []).filter((item) => item.status === 'granted').map((item) => item.permission);
      const pages = await client.get<{ data?: FbPage[] }>(
        `${graph}/me/accounts?${query({ fields: 'id,name,username,access_token,picture{url},followers_count,fan_count,tasks', limit: 100, access_token: long.access_token })}`,
      );
      const managed = (pages.data ?? []).filter((page) => page.access_token);
      if (managed.length === 0) throw new ProviderError('permission', 'Nenhuma página foi autorizada. Reconecta e marca as páginas que a Fábrica pode ler.');
      return managed.map((page) => ({
        account: fbPageAccount(page),
        // Page tokens obtained from a long-lived user token have no expiry date.
        tokens: { accessToken: page.access_token as string, refreshToken: null, expiresAt: null, refreshExpiresAt: expiryFrom(long.expires_in, now()), scopes },
      }));
    },

    async refresh() {
      return null;
    },

    async fetchAccount(tokens: TokenSet, externalId: string) {
      const page = await client.get<FbPage>(`${graph}/${externalId}?${query({ fields: 'id,name,username,picture{url},followers_count,fan_count', access_token: tokens.accessToken })}`);
      return fbPageAccount(page);
    },

    async fetchPosts(tokens, externalId, since) {
      const posts: ProviderPost[] = [];
      let url: string | null = `${graph}/${externalId}/published_posts?${query({
        fields: 'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,type},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
        since: Math.floor(since.getTime() / 1000),
        limit: 50,
        access_token: tokens.accessToken,
      })}`;
      for (let page = 0; url && page < MAX_PAGES; page += 1) {
        const body: { data?: FbPost[]; paging?: { next?: string } } = await client.get(url);
        for (const post of body.data ?? []) posts.push(fbPost(post, await postInsights(post.id, tokens.accessToken)));
        url = body.paging?.next ?? null;
      }
      return posts;
    },

    async revoke() {
      // Revoking from Facebook would end the access of every page of the login; one page is removed by deleting its token.
    },

    usage: () => client.usage(),
  };
}
