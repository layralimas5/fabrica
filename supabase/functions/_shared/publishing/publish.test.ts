import { describe, expect, it } from 'vitest';
import { ProviderError, type FetchFn } from '../social/types.ts';
import { afterFailure, publishFacebookPage, publishInstagram, type Checkpoint } from './publish.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const env = { get: () => undefined };
const target = { platform: 'instagram' as const, accountId: '17', accessToken: 'tok' };

function recorder(handler: (method: string, url: string, body: URLSearchParams | null) => unknown) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const method = init?.method ?? 'GET';
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    const path = new URL(input).pathname.replace(/^\/v[\d.]+/, '');
    calls.push(`${method} ${path}${body?.get('is_carousel_item') ? ' item' : ''}${body?.get('media_type') ? ` ${body.get('media_type')}` : ''}`);
    return reply(handler(method, path, body));
  };
  return { calls, fetchFn };
}

describe('Instagram publishing', () => {
  it('creates one container per image, the carousel container, waits for it and publishes once', async () => {
    let created = 0;
    const checkpoints: Checkpoint[] = [];
    const { calls, fetchFn } = recorder((method, path) => {
      if (method === 'POST' && path.endsWith('/media')) return { id: `c${(created += 1)}` };
      if (path.endsWith('/media_publish')) return { id: 'media1' };
      if (path === '/c3') return { status_code: 'FINISHED' };
      return { permalink: 'https://www.instagram.com/p/X/' };
    });
    const result = await publishInstagram(target, ['https://img/1.jpg', 'https://img/2.jpg'], 'Legenda', {}, { env, fetchFn, wait: async () => undefined, saveCheckpoint: async (checkpoint) => void checkpoints.push(checkpoint) });
    expect(calls).toEqual(['POST /17/media item', 'POST /17/media item', 'POST /17/media CAROUSEL', 'GET /c3', 'POST /17/media_publish', 'GET /media1']);
    expect(checkpoints).toEqual([{ containerId: 'c3' }]);
    expect(result).toEqual({ externalId: 'media1', permalink: 'https://www.instagram.com/p/X/' });
  });

  it('never publishes twice: a retry whose container is already published stops there', async () => {
    const { calls, fetchFn } = recorder(() => ({ status_code: 'PUBLISHED' }));
    await publishInstagram(target, ['https://img/1.jpg'], 'x', { containerId: 'c9' }, { env, fetchFn, saveCheckpoint: async () => undefined });
    expect(calls).toEqual(['GET /c9']);
  });

  it('stops with a clear error when Instagram rejects the images', async () => {
    const { fetchFn } = recorder((method) => (method === 'POST' ? { id: 'c1' } : { status_code: 'ERROR' }));
    await expect(publishInstagram(target, ['https://img/1.jpg'], 'x', {}, { env, fetchFn, saveCheckpoint: async () => undefined })).rejects.toThrow(/recusou as imagens/);
  });
});

describe('Facebook page publishing', () => {
  it('uploads unpublished photos and posts them together', async () => {
    let photo = 0;
    const bodies: URLSearchParams[] = [];
    const fetchFn: FetchFn = async (input, init) => {
      const path = new URL(input).pathname;
      if (init?.body instanceof URLSearchParams) bodies.push(init.body);
      if (path.endsWith('/published_posts')) return reply({ data: [] });
      if (path.endsWith('/photos')) return reply({ id: `p${(photo += 1)}` });
      if (path.endsWith('/feed')) return reply({ id: 'page_post' });
      return reply({ permalink_url: 'https://www.facebook.com/x/posts/1' });
    };
    const result = await publishFacebookPage({ ...target, platform: 'facebook' }, ['https://img/1.jpg', 'https://img/2.jpg'], 'Oi', { env, fetchFn, saveCheckpoint: async () => undefined }, new Date());
    expect(bodies[0].get('published')).toBe('false');
    expect(bodies[2].get('attached_media[1]')).toBe('{"media_fbid":"p2"}');
    expect(result.externalId).toBe('page_post');
  });

  it('treats a post with the same text since the first attempt as already published', async () => {
    const fetchFn: FetchFn = async () => reply({ data: [{ id: 'done', message: 'Oi', permalink_url: 'https://fb/1' }] });
    expect(await publishFacebookPage({ ...target, platform: 'facebook' }, ['https://img/1.jpg'], 'Oi', { env, fetchFn, saveCheckpoint: async () => undefined }, new Date())).toEqual({ externalId: 'done', permalink: 'https://fb/1' });
  });
});

describe('after a failure', () => {
  it('retries temporary errors with growing waits, waits an hour on quota, stops on auth or after 3 attempts', () => {
    expect(afterFailure(new ProviderError('unavailable', 'x'), 1, 3)).toEqual({ status: 'scheduled', retryInMinutes: 10, countsAttempt: true });
    expect(afterFailure(new ProviderError('unavailable', 'x'), 2, 3)).toEqual({ status: 'scheduled', retryInMinutes: 20, countsAttempt: true });
    expect(afterFailure(new ProviderError('rate_limit', 'x'), 1, 3)).toEqual({ status: 'scheduled', retryInMinutes: 60, countsAttempt: true });
    expect(afterFailure(new ProviderError('auth', 'x'), 1, 3)).toEqual({ status: 'failed', reconnect: true });
    expect(afterFailure(new Error('boom'), 3, 3)).toEqual({ status: 'failed', reconnect: false });
  });

  it('waits for a video still processing without spending an attempt, even on the last one', () => {
    expect(afterFailure(new ProviderError('processing', 'x'), 3, 3)).toEqual({ status: 'scheduled', retryInMinutes: 3, countsAttempt: false });
  });
});
