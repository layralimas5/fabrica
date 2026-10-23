import { describe, expect, it } from 'vitest';
import { normalizePermalink } from '../social/permalink.ts';
import { normalizePermalink as appNormalizePermalink, parsePublicationRef } from '../../../../src/domain/social/publication.ts';
import { createYouTubeProvider, googleTokens, youtubeError, ytAccount, ytPost } from '../social/youtube.ts';
import type { FetchFn } from '../social/types.ts';
import { outputFolder, resultsBrief, sanitizeOutputs, staleDecision, STUDIO_KEY_PATTERN, youtubeText, type MeasuredPost } from './studio.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const folder = outputFolder('u1', 'j1', 2);
const now = new Date('2026-10-23T12:00:00Z');

describe('studio outputs', () => {
  it('accepts the job folder files and the long video that stays on the PC', () => {
    const outputs = sanitizeOutputs(
      {
        long: { localFile: 'C:\\estudio\\out\\j1\\long.mp4', previewPath: `${folder}/long-preview.mp4`, durationSec: 480, width: 1920, height: 1080, sizeBytes: 300_000_000 },
        vertical: { path: `${folder}/vertical.mp4`, durationSec: 58, width: 1080, height: 1920, sizeBytes: 30_000_000 },
        thumbnail: `${folder}/thumbnail.jpg`,
      },
      folder,
      ['long', 'vertical'],
    );
    expect(outputs.long).toMatchObject({ localFile: 'C:\\estudio\\out\\j1\\long.mp4', previewPath: `${folder}/long-preview.mp4`, path: null });
    expect(outputs.vertical?.path).toBe(`${folder}/vertical.mp4`);
    expect(outputs.thumbnail).toBe(`${folder}/thumbnail.jpg`);
  });

  it('refuses files outside the folder, unknown names and a missing format', () => {
    expect(() => sanitizeOutputs({ vertical: { path: 'other/j1/2/vertical.mp4' } }, folder, ['vertical'])).toThrow(/fora da pasta/);
    expect(() => sanitizeOutputs({ vertical: { path: `${folder}/../x.mp4` } }, folder, ['vertical'])).toThrow(/nome/);
    expect(() => sanitizeOutputs({}, folder, ['vertical'])).toThrow(/vertical/);
    expect(() => sanitizeOutputs({ long: { localFile: 'C:\\x.exe' } }, folder, ['long'])).toThrow(/local/);
  });

  it('only takes keys in the fsk_ format', () => {
    expect(STUDIO_KEY_PATTERN.test(`fsk_${'a'.repeat(64)}`)).toBe(true);
    expect(STUDIO_KEY_PATTERN.test('fsk_123')).toBe(false);
  });
});

describe('abandoned jobs', () => {
  it('goes back to the queue after 20 minutes of silence, and fails after 3 attempts', () => {
    expect(staleDecision({ status: 'working', heartbeat_at: '2026-10-23T11:50:00Z', attempts: 1 }, now)).toBeNull();
    expect(staleDecision({ status: 'working', heartbeat_at: '2026-10-23T11:30:00Z', attempts: 1 }, now)).toEqual({ status: 'queued' });
    expect(staleDecision({ status: 'working', heartbeat_at: '2026-10-23T11:30:00Z', attempts: 3 }, now)?.status).toBe('failed');
    expect(staleDecision({ status: 'ready', heartbeat_at: null, attempts: 1 }, now)).toBeNull();
  });
});

describe('results brief for a new script', () => {
  const post = (title: string, views?: number): MeasuredPost => ({ title, caption: '', platform: 'tiktok', mediaType: 'video', publishedAt: null, metrics: views === undefined ? {} : { views, likes: 1 } });

  it('lists best and worst by views, ignoring posts without views', () => {
    const brief = resultsBrief([post('a', 100), post('b', 900), post('c', 50), post('d', 400), post('sem números')]);
    expect(brief.measured).toBe(4);
    expect(brief.best).toEqual(['[tiktok/video] "b" (views 900, likes 1)', '[tiktok/video] "d" (views 400, likes 1)']);
    expect(brief.worst[0]).toContain('"c"');
  });

  it('compares nothing with fewer than 3 measured posts', () => {
    expect(resultsBrief([post('a', 1), post('b', 2)])).toEqual({ measured: 2, best: [], worst: [] });
  });

  it('fits YouTube limits', () => {
    expect(youtubeText(`<b>${'x'.repeat(120)}`, 'a > b')).toEqual({ title: `b${'x'.repeat(99)}`, description: 'a  b' });
  });
});

describe('YouTube', () => {
  it('maps a video with public counts, hidden likes staying missing', () => {
    const post = ytPost({ id: 'abcdefghijk', snippet: { title: 'Título', description: 'Desc', publishedAt: '2026-10-20T10:00:00Z', thumbnails: { high: { url: 'https://i/h.jpg' } } }, statistics: { viewCount: '1200', commentCount: '4' } });
    expect(post).toMatchObject({ permalink: 'https://www.youtube.com/watch?v=abcdefghijk', caption: 'Título\nDesc', thumbnailUrl: 'https://i/h.jpg' });
    expect(post.metrics).toEqual({ views: 1200, comments: 4 });
  });

  it('hides subscribers when the channel hides them', () => {
    expect(ytAccount({ id: 'UC1', snippet: { title: 'Nivora' }, statistics: { subscriberCount: '10', hiddenSubscriberCount: true, videoCount: '3' } }).metrics).toEqual({ posts: 3 });
  });

  it('keeps the refresh token Google does not send again, and translates quota errors', () => {
    expect(googleTokens({ access_token: 'a', expires_in: 3600, scope: 'x y' }, now, 'r').refreshToken).toBe('r');
    expect(youtubeError(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }).kind).toBe('rate_limit');
    expect(youtubeError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }).kind).toBe('permission');
  });

  it('asks for offline access with consent, and reads the uploads since the date', async () => {
    const provider = createYouTubeProvider({ get: (name) => ({ YOUTUBE_CLIENT_ID: 'id', YOUTUBE_CLIENT_SECRET: 's' })[name] }, async () => reply({}));
    const url = new URL(provider.authorizeUrl('st4te', 'https://cb'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toContain('youtube.upload');

    const fetchFn: FetchFn = async (input) => {
      if (input.includes('/channels')) return reply({ items: [{ id: 'UC1', contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
      if (input.includes('/playlistItems'))
        return reply({ items: [{ contentDetails: { videoId: 'aaaaaaaaaaa', videoPublishedAt: '2026-10-20T00:00:00Z' } }, { contentDetails: { videoId: 'bbbbbbbbbbb', videoPublishedAt: '2026-09-01T00:00:00Z' } }] });
      return reply({ items: [{ id: 'aaaaaaaaaaa', statistics: { viewCount: '5' } }] });
    };
    const reader = createYouTubeProvider({ get: () => 'x' }, fetchFn);
    const posts = await reader.fetchPosts({ accessToken: 't', refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: [] }, 'UC1', new Date('2026-10-01T00:00:00Z'));
    expect(posts.map((item) => item.externalId)).toEqual(['aaaaaaaaaaa']);
  });

  it('normalizes every YouTube link to the watch URL, in both mirrors', () => {
    for (const raw of ['https://youtu.be/abcdefghijk?si=x', 'https://m.youtube.com/watch?v=abcdefghijk&t=3', 'https://www.youtube.com/shorts/abcdefghijk']) {
      expect(normalizePermalink(raw)).toBe('https://www.youtube.com/watch?v=abcdefghijk');
      expect(appNormalizePermalink(raw)).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    }
    expect(parsePublicationRef('youtube.com/shorts/abcdefghijk', 'instagram')).toEqual({ platform: 'youtube', externalId: 'abcdefghijk', permalink: 'https://www.youtube.com/watch?v=abcdefghijk' });
  });
});
