import { ProviderError, type FetchFn } from '../social/types.ts';
import { stillProcessing } from './video.ts';

/**
 * TikTok Content Posting API in upload mode: the carousel goes to the account's drafts (inbox) and the owner
 * finishes the post in the app (music, Publish). Direct posting needs a TikTok audit this app does not have.
 * Pure (fetch injected), so the call sequence is unit tested.
 * https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content
 */

const API = 'https://open.tiktokapis.com/v2/post/publish';
const MAX_TITLE = 90;
const MAX_DESCRIPTION = 4000;
const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 3000;
const DELIVERED = ['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE'];

export interface TikTokCheckpoint {
  /** Saved right after TikTok accepts the upload, so a retry checks it instead of creating a second draft. */
  publishId?: string;
  /** When a video was sent: TikTok's download gets a time limit before it counts as a failure. */
  sentAt?: string;
}

export interface TikTokDraftDeps {
  fetchFn: FetchFn;
  wait?: (ms: number) => Promise<unknown>;
  saveCheckpoint: (checkpoint: TikTokCheckpoint) => Promise<void>;
}

export interface TikTokDraftInput {
  accessToken: string;
  /** Image URLs on a domain verified in the TikTok app (TikTok refuses any other). */
  imageUrls: string[];
  title: string;
  caption: string;
}

interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * TikTok only pulls media from a verified domain, and a Supabase signed URL is not one: the same object is
 * served through the Fábrica's own site (`/m/*` and `/v/*` proxy to the signed storage path, token included).
 */
export function verifiedMediaUrl(signedUrl: string, appUrl: string): string {
  const url = new URL(signedUrl);
  for (const [bucket, route] of Object.entries(VERIFIED_ROUTES)) {
    const marker = `/storage/v1/object/sign/${bucket}/`;
    const at = url.pathname.indexOf(marker);
    if (at >= 0) return `${appUrl.replace(/\/+$/, '')}/${route}/${url.pathname.slice(at + marker.length)}${url.search}`;
  }
  throw new Error('link assinado fora dos buckets publicáveis');
}

/** Bucket → route of the Fábrica's site that proxies it (public/_redirects): images at /m, studio videos at /v. */
const VERIFIED_ROUTES: Record<string, string> = { 'publish-media': 'm', 'studio-media': 'v' };

export function tiktokPublishError(code: string, status: number): ProviderError {
  if (code === 'access_token_invalid' || status === 401) return new ProviderError('auth', 'A autorização do TikTok expirou. Reconecta a conta.');
  if (code === 'scope_not_authorized' || code === 'scope_permission_missed') {
    return new ProviderError('permission', 'A conta não deu a permissão de enviar conteúdo (video.upload). Reconecta e aceita todas as permissões.');
  }
  if (code === 'spam_risk_too_many_pending_share') {
    return new ProviderError('rate_limit', 'O TikTok limita os rascunhos pendentes por conta. Publique ou apague os rascunhos no app; a Fábrica tenta de novo em 1 hora.');
  }
  if (code === 'url_ownership_unverified') return new ProviderError('permission', 'O TikTok não reconhece o site das imagens como verificado. Confere a verificação de fabrica-s.netlify.app no app do TikTok.');
  if (code.startsWith('spam_risk') || code === 'unaudited_client_can_only_post_to_private_accounts') return new ProviderError('permission', `O TikTok bloqueou o envio para esta conta (${code}).`);
  if (code === 'rate_limit_exceeded' || status === 429) return new ProviderError('rate_limit', 'Limite de chamadas do TikTok atingido.');
  return new ProviderError('unavailable', `O TikTok recusou o envio (${code}).`);
}

async function call<T>(fetchFn: FetchFn, path: string, token: string, body: unknown): Promise<T> {
  const response = await fetchFn(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new ProviderError('unavailable', 'O TikTok não respondeu.');
  });
  const envelope = (await response.json().catch(() => ({}))) as Envelope<T>;
  const code = envelope.error?.code ?? (response.ok ? 'ok' : `http_${response.status}`);
  if (code === 'ok' && envelope.data) return envelope.data;
  throw tiktokPublishError(code, response.status);
}

async function fetchStatus(fetchFn: FetchFn, token: string, publishId: string): Promise<{ status?: string; fail_reason?: string }> {
  return call(fetchFn, '/status/fetch/', token, { publish_id: publishId });
}

/** Sends the images as a photo post to the account's drafts and waits until TikTok has them. Returns the publish id. */
export async function sendTikTokDraft(input: TikTokDraftInput, checkpoint: TikTokCheckpoint, deps: TikTokDraftDeps): Promise<string> {
  const wait = deps.wait ?? sleep;
  let publishId = checkpoint.publishId;

  if (publishId) {
    const previous = await fetchStatus(deps.fetchFn, input.accessToken, publishId);
    if (previous.status && DELIVERED.includes(previous.status)) return publishId;
    if (previous.status === 'FAILED') publishId = undefined;
  }

  if (!publishId) {
    const init = await call<{ publish_id?: string }>(deps.fetchFn, '/content/init/', input.accessToken, {
      post_info: { title: input.title.slice(0, MAX_TITLE), description: input.caption.slice(0, MAX_DESCRIPTION) },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: input.imageUrls },
      post_mode: 'MEDIA_UPLOAD',
      media_type: 'PHOTO',
    });
    if (!init.publish_id) throw new ProviderError('unavailable', 'O TikTok aceitou o envio mas não devolveu o id.');
    publishId = init.publish_id;
    await deps.saveCheckpoint({ publishId });
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const current = await fetchStatus(deps.fetchFn, input.accessToken, publishId);
    if (current.status && DELIVERED.includes(current.status)) return publishId;
    if (current.status === 'FAILED') throw new ProviderError('unavailable', `O TikTok não conseguiu baixar as imagens (${current.fail_reason ?? 'sem motivo'}).`);
    if (attempt < POLL_ATTEMPTS - 1) await wait(POLL_DELAY_MS);
  }
  throw new ProviderError('unavailable', 'O TikTok ainda está baixando as imagens. A próxima tentativa continua de onde parou.');
}

/**
 * Sends a studio video to the account's drafts (inbox upload). TikTok takes no caption in this mode: the owner
 * writes it in the app, where the draft arrives as a notification. Returns the publish id.
 */
export async function sendTikTokVideoDraft(input: { accessToken: string; videoUrl: string }, checkpoint: TikTokCheckpoint, deps: TikTokDraftDeps & { now?: () => Date }): Promise<string> {
  const wait = deps.wait ?? sleep;
  const now = deps.now ?? (() => new Date());
  let publishId = checkpoint.publishId;
  let sentAt = checkpoint.sentAt;

  if (publishId) {
    const previous = await fetchStatus(deps.fetchFn, input.accessToken, publishId);
    if (previous.status && DELIVERED.includes(previous.status)) return publishId;
    if (previous.status === 'FAILED') publishId = undefined;
  }

  if (!publishId) {
    const init = await call<{ publish_id?: string }>(deps.fetchFn, '/inbox/video/init/', input.accessToken, { source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl } });
    if (!init.publish_id) throw new ProviderError('unavailable', 'O TikTok aceitou o envio mas não devolveu o id.');
    publishId = init.publish_id;
    sentAt = now().toISOString();
    await deps.saveCheckpoint({ publishId, sentAt });
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const current = await fetchStatus(deps.fetchFn, input.accessToken, publishId);
    if (current.status && DELIVERED.includes(current.status)) return publishId;
    if (current.status === 'FAILED') throw new ProviderError('unavailable', `O TikTok não conseguiu baixar o vídeo (${current.fail_reason ?? 'sem motivo'}).`);
    if (attempt < POLL_ATTEMPTS - 1) await wait(POLL_DELAY_MS);
  }
  throw stillProcessing('O TikTok ainda está baixando o vídeo.', sentAt, now());
}
