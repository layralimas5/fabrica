import { describe, expect, it } from 'vitest';
import { canAutoPublish } from '../publishing/job';
import { formatDuration, formatsFor, sanitizeVideoJobInput, studioOnline, videoJobProblems, videoPublishProblems, type VideoJob, type VideoJobInput } from './videoJob';

const now = new Date('2026-10-23T12:00:00Z');
const later = new Date('2026-10-24T22:00:00Z');
const input = (patch: Partial<VideoJobInput> = {}): VideoJobInput => ({ projectId: null, channel: 'nivora', mode: 'create', title: 'SaaS sem código', brief: 'Como criar um SaaS sem programar, para iniciantes, CTA comenta eu quero.', formats: ['long', 'vertical'], compositions: {}, ...patch });
const ready = (patch: Partial<VideoJob['outputs']> = {}): Pick<VideoJob, 'status' | 'outputs'> => ({
  status: 'ready',
  outputs: {
    long: { path: null, previewPath: 'u/j/1/long-preview.mp4', localFile: 'C:\\out\\long.mp4', durationSec: 480, width: 1920, height: 1080, sizeBytes: 3e8 },
    vertical: { path: 'u/j/1/vertical.mp4', localFile: null, durationSec: 58, width: 1080, height: 1920, sizeBytes: 3e7 },
    ...patch,
  },
});
const youtube = { platform: 'youtube' as const, status: 'connected' as const, scopes: ['https://www.googleapis.com/auth/youtube.upload'] };
const instagram = { platform: 'instagram' as const, status: 'connected' as const, scopes: ['instagram_business_content_publish'] };

describe('video request', () => {
  it('accepts a complete briefing and asks for more when it is too short', () => {
    expect(videoJobProblems(input())).toEqual([]);
    expect(videoJobProblems(input({ brief: 'curto' })).join(' ')).toMatch(/detalhe/);
  });

  it('keeps Lumo to render only and asks for the compositions to render', () => {
    expect(videoJobProblems(input({ channel: 'lumo' })).join(' ')).toMatch(/só aceita/);
    expect(videoJobProblems(input({ channel: 'lumo', mode: 'render', formats: ['vertical'] })).join(' ')).toMatch(/composição/);
    expect(videoJobProblems(input({ channel: 'lumo', mode: 'render', formats: ['vertical'], compositions: { vertical: 'Lumo-L01-T01-C01' } }))).toEqual([]);
  });

  it('drops compositions of formats not asked and orders the formats', () => {
    expect(sanitizeVideoJobInput(input({ mode: 'render', formats: ['vertical', 'long'], compositions: { long: ' A ', vertical: 'B' } }))).toMatchObject({ formats: ['long', 'vertical'], compositions: { long: 'A', vertical: 'B' } });
    expect(sanitizeVideoJobInput(input({ compositions: { long: 'A' } })).compositions).toEqual({});
  });
});

describe('publishing a video', () => {
  const plan = { format: 'long' as const, title: 'Título', caption: 'Descrição', privacy: 'public' as const, postAt: later };

  it('sends the long video only to YouTube (it lives on the PC) and vertical everywhere', () => {
    expect(videoPublishProblems(ready(), youtube, plan, now)).toEqual([]);
    expect(formatsFor('instagram')).toEqual(['vertical']);
    expect(videoPublishProblems(ready(), instagram, { ...plan, format: 'vertical' }, now)).toEqual([]);
    expect(videoPublishProblems(ready(), { ...instagram, platform: 'facebook', scopes: ['pages_manage_posts'] }, plan, now).join(' ')).toMatch(/só existe no PC/);
  });

  it('refuses a Short over 3 minutes and YouTube text with < or >', () => {
    const long = ready({ vertical: { path: 'p', localFile: null, durationSec: 200, width: 1080, height: 1920, sizeBytes: 1 } });
    expect(videoPublishProblems(long, youtube, { ...plan, format: 'vertical' }, now).join(' ')).toMatch(/até 180 s/);
    expect(videoPublishProblems(ready(), youtube, { ...plan, title: 'a <b>' }, now).join(' ')).toMatch(/< nem >/);
  });

  it('asks for the upload permission and a time in the future', () => {
    expect(videoPublishProblems(ready(), { ...youtube, scopes: ['x'] }, plan, now).join(' ')).toMatch(/youtube\.upload/);
    expect(videoPublishProblems(ready(), youtube, { ...plan, postAt: now }, now).join(' ')).toMatch(/5 minutos/);
  });

  it('keeps YouTube out of the carousel queue', () => {
    expect(canAutoPublish({ platform: 'youtube' })).toBe(false);
    expect(canAutoPublish({ platform: 'tiktok' })).toBe(true);
  });
});

describe('studio helpers', () => {
  it('formats durations and tells when the studio is online', () => {
    expect(formatDuration(58)).toBe('0:58');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(studioOnline('2026-10-23T11:58:30Z', now)).toBe(true);
    expect(studioOnline('2026-10-23T11:50:00Z', now)).toBe(false);
    expect(studioOnline(null, now)).toBe(false);
  });
});
