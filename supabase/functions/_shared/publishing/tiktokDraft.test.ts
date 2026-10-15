import { describe, expect, it } from 'vitest';
import { ProviderError, type FetchFn } from '../social/types.ts';
import { sendTikTokDraft, tiktokPublishError, verifiedMediaUrl, type TikTokCheckpoint } from './tiktokDraft.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ok = (data: unknown) => reply({ data, error: { code: 'ok' } });
const input = { accessToken: 'tok', imageUrls: ['https://fabrica-s.netlify.app/m/u/1.jpg?token=a', 'https://fabrica-s.netlify.app/m/u/2.jpg?token=b'], title: 'Título', caption: 'Legenda #tag' };

function recorder(statuses: string[], initBody: unknown = { publish_id: 'p1' }) {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const path = new URL(url).pathname.replace('/v2/post/publish', '');
    calls.push(path);
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    if (path === '/content/init/') return ok(initBody);
    return ok({ status: statuses.shift() ?? 'PROCESSING_DOWNLOAD' });
  };
  return { calls, bodies, fetchFn };
}

describe('TikTok drafts', () => {
  it('sends the images as a photo post in upload mode and waits until they reach the drafts', async () => {
    const checkpoints: TikTokCheckpoint[] = [];
    const { calls, bodies, fetchFn } = recorder(['PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX']);
    const id = await sendTikTokDraft(input, {}, { fetchFn, wait: async () => undefined, saveCheckpoint: async (checkpoint) => void checkpoints.push(checkpoint) });
    expect(id).toBe('p1');
    expect(calls).toEqual(['/content/init/', '/status/fetch/', '/status/fetch/']);
    expect(bodies[0]).toMatchObject({ post_mode: 'MEDIA_UPLOAD', media_type: 'PHOTO', source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: input.imageUrls }, post_info: { title: 'Título', description: 'Legenda #tag' } });
    expect(checkpoints).toEqual([{ publishId: 'p1' }]);
  });

  it('never creates a second draft: a retry with a delivered publish id stops there', async () => {
    const { calls, fetchFn } = recorder(['SEND_TO_USER_INBOX']);
    expect(await sendTikTokDraft(input, { publishId: 'p0' }, { fetchFn, saveCheckpoint: async () => undefined })).toBe('p0');
    expect(calls).toEqual(['/status/fetch/']);
  });

  it('starts over when the previous upload failed on TikTok', async () => {
    const { calls, fetchFn } = recorder(['FAILED', 'SEND_TO_USER_INBOX']);
    expect(await sendTikTokDraft(input, { publishId: 'p0' }, { fetchFn, wait: async () => undefined, saveCheckpoint: async () => undefined })).toBe('p1');
    expect(calls).toEqual(['/status/fetch/', '/content/init/', '/status/fetch/']);
  });

  it('cuts the title to the 90 characters TikTok accepts', async () => {
    const { bodies, fetchFn } = recorder(['SEND_TO_USER_INBOX']);
    await sendTikTokDraft({ ...input, title: 'x'.repeat(120) }, {}, { fetchFn, saveCheckpoint: async () => undefined });
    expect((bodies[0] as { post_info: { title: string } }).post_info.title).toHaveLength(90);
  });

  it('keeps the publish id and asks for a retry while TikTok is still downloading', async () => {
    const { fetchFn } = recorder([]);
    await expect(sendTikTokDraft(input, {}, { fetchFn, wait: async () => undefined, saveCheckpoint: async () => undefined })).rejects.toThrow(/ainda está baixando/);
  });

  it('reports a failed download with the reason', async () => {
    const fetchFn: FetchFn = async (url) => (url.includes('/content/init/') ? ok({ publish_id: 'p1' }) : ok({ status: 'FAILED', fail_reason: 'picture_size_check_failed' }));
    await expect(sendTikTokDraft(input, {}, { fetchFn, saveCheckpoint: async () => undefined })).rejects.toThrow(/picture_size_check_failed/);
  });

  it('turns TikTok refusals into what to do next', async () => {
    const fetchFn: FetchFn = async () => reply({ error: { code: 'scope_not_authorized' } }, 403);
    await expect(sendTikTokDraft(input, {}, { fetchFn, saveCheckpoint: async () => undefined })).rejects.toMatchObject({ kind: 'permission' });
    expect(tiktokPublishError('spam_risk_too_many_pending_share', 403).kind).toBe('rate_limit');
    expect(tiktokPublishError('access_token_invalid', 401)).toBeInstanceOf(ProviderError);
    expect(tiktokPublishError('access_token_invalid', 401).kind).toBe('auth');
    expect(tiktokPublishError('url_ownership_unverified', 403).kind).toBe('permission');
    expect(tiktokPublishError('internal_error', 500).kind).toBe('unavailable');
  });
});

describe('verified media URL', () => {
  it('serves the signed storage object through the verified site, keeping the token', () => {
    const signed = 'https://ref.supabase.co/storage/v1/object/sign/publish-media/user-1/job-2/01.jpg?token=abc.def';
    expect(verifiedMediaUrl(signed, 'https://fabrica-s.netlify.app/')).toBe('https://fabrica-s.netlify.app/m/user-1/job-2/01.jpg?token=abc.def');
  });

  it('refuses links from any other bucket', () => {
    expect(() => verifiedMediaUrl('https://ref.supabase.co/storage/v1/object/sign/other/a.jpg?token=x', 'https://a.app')).toThrow();
  });
});
