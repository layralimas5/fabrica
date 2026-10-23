/**
 * What every network adapter returns, in the Fábrica's own words. Pure TypeScript (no Deno APIs), so the
 * mapping of each API response is unit tested with vitest from the app (`npm test`).
 *
 * Keep the metric keys in sync with src/domain/social/metrics.ts.
 */

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
export type MediaType = 'carousel' | 'image' | 'video' | 'reel' | 'story' | 'text' | 'other';

/** Post metrics. A key is present only when the API returned it: missing means unavailable, never zero. */
export const POST_METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'] as const;
export type PostMetricKey = (typeof POST_METRIC_KEYS)[number];
export type PostMetrics = Partial<Record<PostMetricKey, number>>;

export const ACCOUNT_METRIC_KEYS = ['followers', 'reach', 'views', 'posts'] as const;
export type AccountMetricKey = (typeof ACCOUNT_METRIC_KEYS)[number];
export type AccountMetrics = Partial<Record<AccountMetricKey, number>>;

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
}

export interface ProviderAccount {
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  metrics: AccountMetrics;
}

export interface ProviderPost {
  externalId: string;
  permalink: string | null;
  caption: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  metrics: PostMetrics;
}

/** One account authorized in a login. A Facebook login can bring several pages, each with its own token. */
export interface AuthorizedAccount {
  account: ProviderAccount;
  tokens: TokenSet;
}

export interface ProviderEnv {
  get(name: string): string | undefined;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Rate-limit usage reported by the API, kept with the connection so the screen can show it. */
export interface RateUsage {
  /** Highest usage percentage reported (Meta X-App-Usage / X-Business-Use-Case-Usage). */
  percent: number | null;
  /** True when the API refused a call for quota. */
  limited: boolean;
  checkedAt: string;
}

export interface Provider {
  platform: SocialPlatform;
  /** Names of the secrets this provider needs; the screen shows which ones are missing. */
  requiredSecrets: string[];
  scopes: string[];
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<AuthorizedAccount[]>;
  /** New tokens when the current ones are close to expiring and the network allows refreshing; null otherwise. */
  refresh(tokens: TokenSet, now: Date): Promise<TokenSet | null>;
  fetchAccount(tokens: TokenSet, externalId: string): Promise<ProviderAccount>;
  /** Posts published since the date, newest first, with their current metrics. */
  fetchPosts(tokens: TokenSet, externalId: string, since: Date): Promise<ProviderPost[]>;
  /** Asks the network to forget the authorization, when it offers a way to. */
  revoke(tokens: TokenSet): Promise<void>;
  /** Usage of the quota seen in the last responses. */
  usage(): RateUsage;
}

/** processing: the network accepted the media and is still working on it (a video); waiting is the whole fix. */
export type ProviderErrorKind = 'auth' | 'rate_limit' | 'permission' | 'not_configured' | 'unavailable' | 'processing';

/** An API refusal translated into what the Fábrica does next (reconnect, wait, ask for a permission). */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
  }
}
