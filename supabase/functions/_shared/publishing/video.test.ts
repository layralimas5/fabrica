import { describe, expect, it } from 'vitest';
import { ProviderError, type FetchFn } from '../social/types.ts';
import { sendTikTokVideoDraft, verifiedMediaUrl } from './tiktokDraft.ts';
import { facebookVideoLink, publishFacebookVideo, publishInstagramReel, stillProcessing, type VideoCheckpoint } from './video.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const env = { get: () => undefined };
const target = { platform: 'instagram' as const, accountId: '17', accessToken: 'tok' };
const input = { videoUrl: 'https://v/1.mp4', coverUrl: 'https://v/1.jpg', caption: 'Legenda', title: 'Título' };
const noWait = async () => undefined;
const at = new Date('2026-10-23T12:00:00Z');

describe('Instagram Reels', () => {
  it('creates the reel container with video and cover, saves it, waits and publishes once', async () => {
    const calls: string[] = [];
    const checkpoints: VideoCheckpoint[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      const path = new URL(url).pathname.replace(/^\/v[\d.]+/, '');
      const body = init?.body instanceof URLSearchParams ? init.body : null;
      calls.push(`${init?.method ?? 'GET'} ${path}${body?.get('media_type') ? ` ${body.get('media_type')} ${body.get('cover_url')}` : ''}`);
      if (path.endsWith('/media')) return reply({ id: 'r1' });
      if (path.endsWith('/media_publish')) return reply({ id: 'reel1' });
      if (path === '/r1') return reply({ status_code: calls.filter((c) => c === 'GET /r1').length > 1 ? 'FINISHED' : 'IN_PROGRESS' });
      return reply({ permalink: 'https://www.instagram.com/reel/X/' });
    };
    const result = await publishInstagramReel(target, input, {}, { env, fetchFn, wait: noWait, now: () => at, saveCheckpoint: async (c) => void checkpoints.push(c) });
    expect(calls).toEqual(['POST /17/media REELS https://v/1.jpg', 'GET /r1', 'GET /r1', 'POST /17/media_publish', 'GET /reel1']);
    expect(checkpoints).toEqual([{ containerId: 'r1', containerAt: at.toISOString() }]);
    expect(result).toEqual({ externalId: 'reel1', permalink: 'https://www.instagram.com/reel/X/' });
  });

  it('asks to wait (processing) while the video is still being processed, keeping the container', async () => {
    const fetchFn: FetchFn = async () => reply({ status_code: 'IN_PROGRESS' });
    const run = publishInstagramReel(target, input, { containerId: 'r1', containerAt: at.toISOString() }, { env, fetchFn, wait: noWait, now: () => at, saveCheckpoint: async () => undefined });
    await expect(run).rejects.toMatchObject({ kind: 'processing' });
  });

  it('turns an hour of processing into a real failure', () => {
    expect(stillProcessing('x', '2026-10-23T10:00:00Z', at).kind).toBe('unavailable');
    expect(stillProcessing('x', '2026-10-23T11:30:00Z', at).kind).toBe('processing');
  });

  it('never publishes twice: a published container ends the retry', async () => {
    const fetchFn: FetchFn = async () => reply({ status_code: 'PUBLISHED' });
    expect(await publishInstagramReel(target, input, { containerId: 'r1' }, { env, fetchFn, saveCheckpoint: async () => undefined })).toEqual({ externalId: null, permalink: null });
  });
});

describe('Facebook page video', () => {
  it('sends the file URL to graph-video and returns the absolute permalink', async () => {
    const hosts: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      const parsed = new URL(url);
      hosts.push(`${parsed.hostname}${parsed.pathname.replace(/^\/v[\d.]+/, '')}`);
      if (parsed.pathname.endsWith('/videos') && parsed.hostname === 'graph.facebook.com') return reply({ data: [] });
      if (parsed.pathname.endsWith('/videos')) return reply({ id: 'v1' });
      return reply({ permalink_url: '/page/videos/v1/' });
    };
    const result = await publishFacebookVideo({ ...target, platform: 'facebook' }, input, { env, fetchFn, saveCheckpoint: async () => undefined }, at);
    expect(hosts).toEqual(['graph.facebook.com/17/videos', 'graph-video.facebook.com/17/videos', 'graph.facebook.com/v1']);
    expect(result).toEqual({ externalId: 'v1', permalink: 'https://www.facebook.com/page/videos/v1/' });
  });

  it('treats a video with the same description since the first attempt as already posted', async () => {
    const fetchFn: FetchFn = async () => reply({ data: [{ id: 'old', description: 'Legenda', permalink_url: 'https://www.facebook.com/x/videos/old/' }] });
    expect((await publishFacebookVideo({ ...target, platform: 'facebook' }, input, { env, fetchFn, saveCheckpoint: async () => undefined }, at)).externalId).toBe('old');
    expect(facebookVideoLink(undefined)).toBeNull();
  });
});

describe('TikTok video draft', () => {
  it('pulls the video through the verified site and returns when it reaches the inbox', async () => {
    const bodies: unknown[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (url.endsWith('/inbox/video/init/')) return reply({ data: { publish_id: 'p1' }, error: { code: 'ok' } });
      return reply({ data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } });
    };
    const saved: unknown[] = [];
    const videoUrl = verifiedMediaUrl('https://x.supabase.co/storage/v1/object/sign/studio-media/u/j/1/vertical.mp4?token=abc', 'https://fabrica-s.netlify.app/');
    expect(videoUrl).toBe('https://fabrica-s.netlify.app/v/u/j/1/vertical.mp4?token=abc');
    expect(await sendTikTokVideoDraft({ accessToken: 't', videoUrl }, {}, { fetchFn, wait: noWait, now: () => at, saveCheckpoint: async (c) => void saved.push(c) })).toBe('p1');
    expect(bodies[0]).toEqual({ source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } });
    expect(saved).toEqual([{ publishId: 'p1', sentAt: at.toISOString() }]);
  });

  it('keeps waiting while TikTok downloads, without sending a second draft', async () => {
    let inits = 0;
    const fetchFn: FetchFn = async (url) => {
      if (url.endsWith('/init/')) inits += 1;
      return reply({ data: { status: 'PROCESSING_DOWNLOAD' }, error: { code: 'ok' } });
    };
    await expect(sendTikTokVideoDraft({ accessToken: 't', videoUrl: 'https://v' }, { publishId: 'p1', sentAt: at.toISOString() }, { fetchFn, wait: noWait, now: () => at, saveCheckpoint: async () => undefined })).rejects.toBeInstanceOf(ProviderError);
    expect(inits).toBe(0);
  });
});
