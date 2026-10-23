import { DEFAULT_GRAPH_VERSION, MetaClient } from '../social/meta.ts';
import { ProviderError } from '../social/types.ts';
import type { PublisherDeps, PublishResult, PublishTarget } from './publish.ts';

/**
 * Videos of the studio through the official APIs: Instagram Reels (container + publish) and Facebook page videos.
 * Video processing takes longer than an image: while the network is still processing, the job waits a few
 * minutes ("processing", which does not spend an attempt) and continues from the saved container.
 * Pure (fetch injected), so each call sequence is unit tested.
 */

export interface VideoCheckpoint {
  /** Instagram reel container, saved before publishing so a retry never publishes twice. */
  containerId?: string;
  /** When the container was created: past MAX_PROCESSING_MINUTES the wait becomes a failure. */
  containerAt?: string;
}

export interface VideoInput {
  videoUrl: string;
  coverUrl: string | null;
  caption: string;
  title: string;
}

const POLL_ATTEMPTS = 6;
const POLL_DELAY_MS = 4000;
export const MAX_PROCESSING_MINUTES = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function publishInstagramReel(
  target: PublishTarget,
  input: VideoInput,
  checkpoint: VideoCheckpoint,
  deps: Omit<PublisherDeps, 'saveCheckpoint'> & { saveCheckpoint: (checkpoint: VideoCheckpoint) => Promise<void>; now?: () => Date },
): Promise<PublishResult> {
  const graph = `https://graph.instagram.com/${deps.env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION}`;
  const client = new MetaClient(deps.fetchFn);
  const wait = deps.wait ?? sleep;
  const now = deps.now ?? (() => new Date());
  const token = { access_token: target.accessToken };
  const status = (id: string) => client.get<{ status_code?: string }>(`${graph}/${id}?${new URLSearchParams({ fields: 'status_code', ...token })}`);

  let { containerId, containerAt } = checkpoint;
  if (containerId) {
    const previous = await status(containerId);
    if (previous.status_code === 'PUBLISHED') return { externalId: null, permalink: null };
    if (previous.status_code === 'EXPIRED' || previous.status_code === 'ERROR') containerId = undefined;
  }

  if (!containerId) {
    const params = new URLSearchParams({ media_type: 'REELS', video_url: input.videoUrl, caption: input.caption, share_to_feed: 'true', ...token });
    if (input.coverUrl) params.set('cover_url', input.coverUrl);
    containerId = (await client.post<{ id: string }>(`${graph}/${target.accountId}/media`, params)).id;
    containerAt = now().toISOString();
    await deps.saveCheckpoint({ containerId, containerAt });
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const current = await status(containerId);
    if (current.status_code === 'FINISHED') break;
    if (current.status_code === 'ERROR' || current.status_code === 'EXPIRED') throw new ProviderError('unavailable', 'O Instagram recusou o vídeo ao processar o Reels (formato, duração ou áudio).');
    if (attempt === POLL_ATTEMPTS - 1) throw stillProcessing('O Instagram ainda está processando o vídeo.', containerAt, now());
    await wait(POLL_DELAY_MS);
  }

  const published = await client.post<{ id: string }>(`${graph}/${target.accountId}/media_publish`, new URLSearchParams({ creation_id: containerId, ...token }));
  const details = await client
    .get<{ permalink?: string }>(`${graph}/${published.id}?${new URLSearchParams({ fields: 'permalink', ...token })}`)
    .catch(() => ({ permalink: undefined }));
  return { externalId: published.id, permalink: details.permalink ?? null };
}

/** Waiting is fine for a while; a container stuck for an hour is a failure that needs a look. */
export function stillProcessing(message: string, since: string | undefined, now: Date): ProviderError {
  const minutes = since ? (now.getTime() - new Date(since).getTime()) / 60_000 : 0;
  if (minutes > MAX_PROCESSING_MINUTES) return new ProviderError('unavailable', `${message} Já passou de ${MAX_PROCESSING_MINUTES} minutos: confere o arquivo e aprova de novo.`);
  return new ProviderError('processing', `${message} A fila confere de novo em poucos minutos.`);
}

export async function publishFacebookVideo(target: PublishTarget, input: VideoInput, deps: PublisherDeps, since: Date): Promise<PublishResult> {
  const version = deps.env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION;
  const graph = `https://graph.facebook.com/${version}`;
  const client = new MetaClient(deps.fetchFn);
  const token = { access_token: target.accessToken };
  const description = input.caption.trim();

  // A video post has no two-step id: before a retry, a video with the same description since the first try counts as done.
  const recent = await client.get<{ data?: { id: string; description?: string; permalink_url?: string }[] }>(
    `${graph}/${target.accountId}/videos?${new URLSearchParams({ fields: 'id,description,permalink_url', since: String(Math.floor(since.getTime() / 1000)), limit: '10', ...token })}`,
  );
  const existing = (recent.data ?? []).find((video) => description && (video.description ?? '').trim() === description);
  if (existing) return { externalId: existing.id, permalink: facebookVideoLink(existing.permalink_url) };

  const params = new URLSearchParams({ file_url: input.videoUrl, description: input.caption, title: input.title, ...token });
  const video = await client.post<{ id: string }>(`https://graph-video.facebook.com/${version}/${target.accountId}/videos`, params);
  const details = await client.get<{ permalink_url?: string }>(`${graph}/${video.id}?${new URLSearchParams({ fields: 'permalink_url', ...token })}`).catch(() => ({ permalink_url: undefined }));
  return { externalId: video.id, permalink: facebookVideoLink(details.permalink_url) };
}

/** Video permalinks come relative ("/page/videos/123/"). */
export function facebookVideoLink(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith('http') ? raw : `https://www.facebook.com${raw.startsWith('/') ? '' : '/'}${raw}`;
}
