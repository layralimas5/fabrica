import { DEFAULT_GRAPH_VERSION, MetaClient } from '../social/meta.ts';
import { ProviderError, type FetchFn, type ProviderEnv } from '../social/types.ts';

/**
 * Publishing through the official APIs: Instagram content publishing (containers) and Facebook page posts.
 * Pure (fetch injected), so each call sequence is unit tested.
 */

export interface PublishTarget {
  platform: 'instagram' | 'facebook';
  /** Instagram user id or Facebook page id. */
  accountId: string;
  accessToken: string;
}

export interface PublishResult {
  externalId: string | null;
  permalink: string | null;
}

export interface Checkpoint {
  /** Instagram container id, saved before publishing so a retry never publishes twice. */
  containerId?: string;
}

const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 3000;
/** The post is live even if its link cannot be read now; the next sync fills it in. */
const permalinkMissing = <T,>(fallback: T) => (error: unknown): T => {
  console.warn('permalink not read', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
  return fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PublisherDeps {
  env: ProviderEnv;
  fetchFn: FetchFn;
  wait?: (ms: number) => Promise<unknown>;
  /** Called with progress that must survive a crash (the job keeps it in its data). */
  saveCheckpoint: (checkpoint: Checkpoint) => Promise<void>;
}

export async function publishInstagram(target: PublishTarget, imageUrls: string[], caption: string, checkpoint: Checkpoint, deps: PublisherDeps): Promise<PublishResult> {
  const graph = `https://graph.instagram.com/${deps.env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION}`;
  const client = new MetaClient(deps.fetchFn);
  const wait = deps.wait ?? sleep;
  const token = { access_token: target.accessToken };

  let containerId = checkpoint.containerId;
  if (containerId) {
    // A previous attempt got this far: if the container is already published, the post exists.
    const status = await client.get<{ status_code?: string }>(`${graph}/${containerId}?${new URLSearchParams({ fields: 'status_code', ...token })}`);
    if (status.status_code === 'PUBLISHED') return { externalId: null, permalink: null };
    if (status.status_code === 'EXPIRED' || status.status_code === 'ERROR') containerId = undefined;
  }

  if (!containerId) {
    if (imageUrls.length === 1) {
      containerId = (await client.post<{ id: string }>(`${graph}/${target.accountId}/media`, new URLSearchParams({ image_url: imageUrls[0], caption, ...token }))).id;
    } else {
      const children: string[] = [];
      for (const url of imageUrls) {
        children.push((await client.post<{ id: string }>(`${graph}/${target.accountId}/media`, new URLSearchParams({ image_url: url, is_carousel_item: 'true', ...token }))).id);
      }
      containerId = (await client.post<{ id: string }>(`${graph}/${target.accountId}/media`, new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption, ...token }))).id;
    }
    await deps.saveCheckpoint({ containerId });
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const status = await client.get<{ status_code?: string }>(`${graph}/${containerId}?${new URLSearchParams({ fields: 'status_code', ...token })}`);
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new ProviderError('unavailable', 'O Instagram recusou as imagens ao processar o post.');
    if (attempt === POLL_ATTEMPTS - 1) throw new ProviderError('unavailable', 'O Instagram ainda está processando as imagens. A próxima tentativa continua de onde parou.');
    await wait(POLL_DELAY_MS);
  }

  const published = await client.post<{ id: string }>(`${graph}/${target.accountId}/media_publish`, new URLSearchParams({ creation_id: containerId, ...token }));
  const details = await client.get<{ permalink?: string }>(`${graph}/${published.id}?${new URLSearchParams({ fields: 'permalink', ...token })}`).catch(permalinkMissing({ permalink: undefined }));
  return { externalId: published.id, permalink: details.permalink ?? null };
}

export async function publishFacebookPage(target: PublishTarget, imageUrls: string[], caption: string, deps: PublisherDeps, since: Date): Promise<PublishResult> {
  const graph = `https://graph.facebook.com/${deps.env.get('META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION}`;
  const client = new MetaClient(deps.fetchFn);
  const token = { access_token: target.accessToken };

  // A feed post has no two-step id: before a retry, a post with the same text since the first try counts as done.
  const recent = await client.get<{ data?: { id: string; message?: string; permalink_url?: string }[] }>(
    `${graph}/${target.accountId}/published_posts?${new URLSearchParams({ fields: 'id,message,permalink_url', since: String(Math.floor(since.getTime() / 1000)), limit: '10', ...token })}`,
  );
  const existing = (recent.data ?? []).find((post) => (post.message ?? '').trim() === caption.trim() && caption.trim());
  if (existing) return { externalId: existing.id, permalink: existing.permalink_url ?? null };

  const photos: string[] = [];
  for (const url of imageUrls) photos.push((await client.post<{ id: string }>(`${graph}/${target.accountId}/photos`, new URLSearchParams({ url, published: 'false', ...token }))).id);
  const body = new URLSearchParams({ message: caption, ...token });
  photos.forEach((id, index) => body.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id })));
  const post = await client.post<{ id: string }>(`${graph}/${target.accountId}/feed`, body);
  const details = await client.get<{ permalink_url?: string }>(`${graph}/${post.id}?${new URLSearchParams({ fields: 'permalink_url', ...token })}`).catch(permalinkMissing({ permalink_url: undefined }));
  return { externalId: post.id, permalink: details.permalink_url ?? null };
}

export type FailureDecision = { status: 'scheduled'; retryInMinutes: number } | { status: 'failed'; reconnect: boolean };

/** What happens after a failed attempt: wait and retry (quota, temporary errors) or stop and tell the user. */
export function afterFailure(error: unknown, attempts: number, maxAttempts: number): FailureDecision {
  if (error instanceof ProviderError && error.kind === 'auth') return { status: 'failed', reconnect: true };
  if (error instanceof ProviderError && error.kind === 'permission') return { status: 'failed', reconnect: false };
  if (attempts >= maxAttempts) return { status: 'failed', reconnect: false };
  const rateLimited = error instanceof ProviderError && error.kind === 'rate_limit';
  return { status: 'scheduled', retryInMinutes: rateLimited ? 60 : 10 * attempts };
}
