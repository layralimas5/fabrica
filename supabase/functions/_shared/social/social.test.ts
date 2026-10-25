import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, importKey } from '../crypto.ts';
import { fbMediaType, fbPost } from './facebook.ts';
import { createInstagramProvider, igPost } from './instagram.ts';
import { insightValues, MetaClient, usagePercents } from './meta.ts';
import { normalizePermalink } from './permalink.ts';
import { normalizePermalink as appNormalizePermalink } from '../../../../src/domain/social/publication.ts';
import { configStatus } from './providers.ts';
import { localDay, syncConnection, type SyncResult, type SyncStore } from './sync.ts';
import { createTikTokProvider, tiktokPost, tiktokTokens } from './tiktok.ts';
import { ProviderError, type FetchFn, type Provider, type ProviderPost, type TokenSet } from './types.ts';

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe('Instagram mapping', () => {
  it('maps a carousel with insights, renaming saved to saves', () => {
    const post = igPost(
      { id: '1', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/X/', media_url: 'https://cdn/x.jpg', timestamp: '2026-10-01T12:00:00+0000', like_count: 3, comments_count: 1 },
      { views: 900, reach: 700, likes: 40, comments: 5, shares: 2, saved: 11 },
    );
    expect(post).toMatchObject({ mediaType: 'carousel', thumbnailUrl: 'https://cdn/x.jpg', publishedAt: '2026-10-01T12:00:00.000Z' });
    expect(post.metrics).toEqual({ views: 900, reach: 700, likes: 40, comments: 5, shares: 2, saves: 11 });
  });

  it('keeps only the counts the media gives when insights are refused, never inventing the rest', () => {
    const post = igPost({ id: '2', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://cdn/c.jpg', like_count: 8, comments_count: 0 }, null);
    expect(post.mediaType).toBe('reel');
    expect(post.metrics).toEqual({ likes: 8, comments: 0 });
  });

  it('builds the authorization URL with the business scopes and the state', () => {
    const provider = createInstagramProvider(env({ INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 's' }), async () => reply({}));
    const url = new URL(provider.authorizeUrl('st4te', 'https://x.supabase.co/functions/v1/social-oauth/callback/instagram'));
    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('asks TikTok to always show the consent screen, so another account can be connected', () => {
    const provider = createTikTokProvider(env({ TIKTOK_CLIENT_KEY: 'key', TIKTOK_CLIENT_SECRET: 's' }), async () => reply({}));
    const url = new URL(provider.authorizeUrl('st4te', 'https://x.supabase.co/functions/v1/social-oauth/callback/tiktok'));
    expect(url.searchParams.get('disable_auto_auth')).toBe('1');
    expect(url.searchParams.get('scope')).toContain('video.list');
  });

  it('exchanges the code (dropping the #_ suffix) for a long-lived token and reads the account', async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = async (input, init) => {
      calls.push(`${init?.method ?? 'GET'} ${input.split('?')[0]} ${init?.body ? String(init.body) : ''}`);
      if (input.startsWith('https://api.instagram.com')) return reply({ data: [{ access_token: 'short', user_id: '17', permissions: 'instagram_business_basic' }] });
      if (input.includes('ig_exchange_token')) return reply({ access_token: 'long', expires_in: 5184000 });
      return reply({ user_id: '17', username: 'momentumm', name: 'Momentumm', followers_count: 1200, media_count: 30 });
    };
    const provider = createInstagramProvider(env({ INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 's' }), fetchFn, () => new Date('2026-10-14T00:00:00Z'));
    const [authorized] = await provider.exchangeCode('abc#_', 'https://cb');
    expect(calls[0]).toMatch(/code=abc( |&|$)/);
    expect(authorized.tokens).toMatchObject({ accessToken: 'long', scopes: ['instagram_business_basic'] });
    expect(authorized.tokens.expiresAt?.toISOString()).toBe('2026-12-13T00:00:00.000Z');
    expect(authorized.account).toMatchObject({ externalId: '17', username: 'momentumm', metrics: { followers: 1200, posts: 30 } });
  });

  it('refreshes only inside the last 10 days and refuses an expired token', async () => {
    const provider = createInstagramProvider(env({}), async () => reply({ access_token: 'new', expires_in: 5184000 }));
    const now = new Date('2026-10-14T00:00:00Z');
    const tokens = (days: number): TokenSet => ({ accessToken: 'a', refreshToken: null, expiresAt: new Date(now.getTime() + days * 86400000), refreshExpiresAt: null, scopes: [] });
    expect(await provider.refresh(tokens(30), now)).toBeNull();
    expect((await provider.refresh(tokens(5), now))?.accessToken).toBe('new');
    await expect(provider.refresh(tokens(-1), now)).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('Meta errors and quota', () => {
  it('turns Meta error codes into what the Fábrica does next', async () => {
    const call = (body: unknown, status = 400) => new MetaClient(async () => reply(body, status)).get('https://graph');
    await expect(call({ error: { code: 190, message: 'Error validating access token: token=EAAB...' } })).rejects.toMatchObject({ kind: 'auth' });
    await expect(call({ error: { code: 4 } })).rejects.toMatchObject({ kind: 'rate_limit' });
    await expect(call({ error: { code: 10 } }, 403)).rejects.toMatchObject({ kind: 'permission' });
    // Meta's own message (which can echo the token) never reaches the user.
    await expect(call({ error: { code: 190, message: 'token=EAAB secret' } })).rejects.not.toThrow(/EAAB/);
  });

  it('reads the highest usage percentage of the headers', async () => {
    expect(usagePercents('{"call_count":12,"total_time":40,"total_cputime":3}')).toEqual([12, 40, 3]);
    expect(usagePercents('{"123":[{"type":"pages","call_count":81,"estimated_time_to_regain_access":0}]}')).toEqual([81]);
    const client = new MetaClient(async () => reply({ ok: true }, 200, { 'x-app-usage': '{"call_count":55}' }));
    await client.get('https://graph');
    expect(client.usage().percent).toBe(55);
  });

  it('reads lifetime and total_value insights and ignores invalid numbers', () => {
    expect(insightValues({ data: [{ name: 'views', values: [{ value: 10 }] }, { name: 'reach', total_value: { value: 7 } }, { name: 'saved', values: [{ value: -1 }] }] })).toEqual({ views: 10, reach: 7 });
  });
});

describe('Facebook and TikTok mapping', () => {
  it('maps a page post: reactions as likes, shares zero when Meta omits them', () => {
    const post = fbPost({ id: 'p_1', message: 'Oi', created_time: '2026-10-02T10:00:00+0000', reactions: { summary: { total_count: 9 } }, comments: { summary: { total_count: 2 } }, attachments: { data: [{ type: 'album' }] } }, { views: 300 });
    expect(post).toMatchObject({ mediaType: 'carousel', caption: 'Oi' });
    expect(post.metrics).toEqual({ likes: 9, comments: 2, shares: 0, views: 300 });
    expect(fbMediaType({ id: 'x' })).toBe('text');
  });

  it('maps a TikTok video without reach nor saves (the Display API has neither)', () => {
    const post = tiktokPost({ id: '73', create_time: 1759400000, view_count: 5000, like_count: 300, comment_count: 12, share_count: 40, share_url: 'https://www.tiktok.com/@lumad/video/73' });
    expect(post.metrics).toEqual({ views: 5000, likes: 300, comments: 12, shares: 40 });
    expect(post.metrics).not.toHaveProperty('saves');
    expect(post.publishedAt).toBe(new Date(1759400000 * 1000).toISOString());
  });

  it('reads TikTok token responses and their errors', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    expect(tiktokTokens({ access_token: 'a', refresh_token: 'r', expires_in: 86400, refresh_expires_in: 31536000, scope: 'user.info.basic,video.list' }, now)).toMatchObject({ scopes: ['user.info.basic', 'video.list'], refreshToken: 'r' });
    expect(() => tiktokTokens({ error: 'invalid_grant' }, now)).toThrow(ProviderError);
  });

  it('stops listing TikTok videos at the start of the window', async () => {
    const now = new Date('2026-10-14T00:00:00Z');
    const old = Math.floor(new Date('2026-08-01').getTime() / 1000);
    const recent = Math.floor(new Date('2026-10-10').getTime() / 1000);
    const provider = createTikTokProvider(env({}), async () => reply({ data: { videos: [{ id: 'new', create_time: recent }, { id: 'old', create_time: old }], has_more: true, cursor: 9 }, error: { code: 'ok' } }), () => now);
    const posts = await provider.fetchPosts({ accessToken: 't', refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: [] }, '', new Date('2026-09-14'));
    expect(posts.map((post) => post.externalId)).toEqual(['new']);
  });
});

describe('configuration and storage helpers', () => {
  it('lists missing secrets by name only', () => {
    const status = configStatus(env({ INSTAGRAM_APP_ID: 'x', INSTAGRAM_APP_SECRET: 'y', TOKEN_ENCRYPTION_KEY: 'k', APP_URL: 'https://app' }), async () => reply({}));
    expect(status.instagram).toMatchObject({ configured: true, missing: [] });
    expect(status.tiktok.missing).toEqual(['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']);
    expect(JSON.stringify(status)).not.toContain('"y"');
  });

  it('encrypts tokens so that the stored value is useless without the key', async () => {
    const key = await importKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
    const sealed = await encrypt(key, 'EAAB-secret-token');
    expect(sealed).not.toContain('EAAB');
    expect(await decrypt(key, sealed)).toBe('EAAB-secret-token');
    const other = await importKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(8))));
    await expect(decrypt(other, sealed)).rejects.toThrow();
    await expect(importKey('c2hvcnQ=')).rejects.toThrow(/32 bytes/);
  });

  it('normalizes permalinks exactly like the app does', () => {
    for (const url of ['https://instagram.com/reel/AbC/?igsh=1', 'https://m.facebook.com/x/posts/1', 'https://vm.tiktok.com/ZM1/']) {
      expect(normalizePermalink(url)).toBe(appNormalizePermalink(url));
    }
  });

  it('counts the day in São Paulo time', () => {
    expect(localDay(new Date('2026-10-15T01:30:00Z'))).toBe('2026-10-14');
  });
});

describe('syncConnection', () => {
  const tokens: TokenSet = { accessToken: 't', refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: [] };
  const post = (id: string): ProviderPost => ({ externalId: id, permalink: null, caption: '', mediaType: 'image', thumbnailUrl: null, publishedAt: null, metrics: { likes: 1 } });

  function memoryStore() {
    const calls: string[] = [];
    let finished: SyncResult | null = null;
    const store: SyncStore = {
      loadTokens: async () => tokens,
      saveTokens: async () => void calls.push('saveTokens'),
      updateProfile: async () => void calls.push('profile'),
      saveAccountMetrics: async (_id, day) => void calls.push(`account:${day}`),
      upsertPublication: async (_user, item) => {
        calls.push(`post:${item.post.externalId}`);
        return `pub-${item.post.externalId}`;
      },
      savePostMetrics: async (id) => void calls.push(`metrics:${id}`),
      finish: async (_id, result) => {
        finished = result;
      },
    };
    return { store, calls, finished: () => finished };
  }

  function fakeProvider(overrides: Partial<Provider>): Provider {
    let usage: number | null = null;
    return {
      platform: 'instagram',
      requiredSecrets: [],
      scopes: [],
      authorizeUrl: () => '',
      exchangeCode: async () => [],
      refresh: async () => null,
      fetchAccount: async () => ({ externalId: '1', username: 'u', displayName: 'U', avatarUrl: null, metrics: { followers: 10 } }),
      fetchPosts: async () => {
        usage = 10;
        return [post('a'), post('b')];
      },
      revoke: async () => undefined,
      usage: () => ({ percent: usage, limited: false, checkedAt: '' }),
      ...overrides,
    };
  }

  const connection = { id: 'c', userId: 'u', platform: 'instagram' as const, externalId: '1', lastSyncAt: null };
  const now = new Date('2026-10-14T15:00:00Z');

  it('stores the profile, today’s account numbers and every post with its metrics', async () => {
    const memory = memoryStore();
    const result = await syncConnection(memory.store, fakeProvider({}), connection, now);
    expect(result).toMatchObject({ status: 'ok', publications: 2, connectionStatus: 'connected' });
    expect(memory.calls).toEqual(['profile', 'account:2026-10-14', 'post:a', 'metrics:pub-a', 'post:b', 'metrics:pub-b']);
  });

  it('saves refreshed tokens before reading', async () => {
    const memory = memoryStore();
    await syncConnection(memory.store, fakeProvider({ refresh: async () => ({ ...tokens, accessToken: 'n' }) }), connection, now);
    expect(memory.calls[0]).toBe('saveTokens');
  });

  it('marks the connection expired when the network refuses the token', async () => {
    const memory = memoryStore();
    const result = await syncConnection(memory.store, fakeProvider({ fetchAccount: async () => Promise.reject(new ProviderError('auth', 'Reconecta')) }), connection, now);
    expect(result).toMatchObject({ status: 'error', connectionStatus: 'expired', error: 'Reconecta' });
    expect(memory.finished()).toEqual(result);
  });

  it('keeps the connection on a rate limit and stops early above the quota ceiling', async () => {
    const limited = await syncConnection(memoryStore().store, fakeProvider({ fetchPosts: async () => Promise.reject(new ProviderError('rate_limit', 'Limite')) }), connection, now);
    expect(limited).toMatchObject({ status: 'rate_limited', connectionStatus: 'connected' });

    const memory = memoryStore();
    const busy = await syncConnection(memory.store, fakeProvider({ usage: () => ({ percent: 90, limited: false, checkedAt: '' }) }), connection, now);
    expect(busy).toMatchObject({ status: 'partial', publications: 1 });
  });
});

describe('instagram scopes', () => {
  it('asks for insights only when INSTAGRAM_INSIGHTS=on, and always for publishing', async () => {
    const { instagramScopes } = await import('./instagram.ts');
    expect(instagramScopes(undefined)).toEqual(['instagram_business_basic', 'instagram_business_content_publish']);
    expect(instagramScopes('on')).toContain('instagram_business_manage_insights');
  });
});
