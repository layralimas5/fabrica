import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importKey, safeEqual } from '../_shared/crypto.ts';
import { corsHeaders, HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { afterFailure, publishFacebookPage, publishInstagram, type Checkpoint, type PublishResult } from '../_shared/publishing/publish.ts';
import { recordPublication } from '../_shared/publishing/record.ts';
import { sendTikTokDraft, sendTikTokVideoDraft, verifiedMediaUrl, type TikTokCheckpoint } from '../_shared/publishing/tiktokDraft.ts';
import { publishFacebookVideo, publishInstagramReel, type VideoCheckpoint } from '../_shared/publishing/video.ts';
import { titleFromCaption } from '../_shared/social/permalink.ts';
import { createProvider } from '../_shared/social/providers.ts';
import { loadTokenSet, saveTokenSet } from '../_shared/social/supabaseStore.ts';
import { ProviderError, type TokenSet } from '../_shared/social/types.ts';

/**
 * Publishes approved jobs that are due. Instagram and Facebook pages get the post itself; TikTok gets the
 * carousel or the video in the account's drafts (upload mode), and the owner finishes it in the app.
 * Studio videos go as Reels (Instagram) and page videos (Facebook). YouTube jobs are not handled here: the
 * long file lives on the studio's machine, which uploads it through the studio function.
 *   POST with x-cron-secret          → every user's due jobs (scheduled every few minutes by pg_cron)
 *   POST {action:'run-mine'} + JWT   → the user's own due jobs, now
 * A job is claimed atomically (scheduled → publishing), so two runs never publish the same post.
 * Deploy with --no-verify-jwt.
 */

const env = { get: (name: string) => Deno.env.get(name) };
const MAX_ATTEMPTS = 3;
const BATCH = 5;
const SIGNED_URL_SECONDS = 3600;

interface JobData {
  caption?: string;
  media?: string[];
  title?: string;
  /** 'video' for studio videos; carousels have no kind. */
  kind?: 'video';
  format?: 'long' | 'vertical';
  /** 'studio' for YouTube: the local studio uploads it. */
  uploader?: 'studio';
  checkpoint?: Checkpoint & TikTokCheckpoint & VideoCheckpoint;
}

interface JobRow {
  id: string;
  user_id: string;
  connection_id: string;
  carousel_id: string | null;
  video_job_id: string | null;
  attempts: number;
  scheduled_at: string;
  approved_at: string | null;
  data: JobData;
}

interface Connection {
  id: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube';
  external_id: string;
  status: string;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const given = request.headers.get('x-cron-secret');
    if (given !== null) {
      const secret = Deno.env.get('CRON_SECRET');
      if (!secret || !safeEqual(given, secret)) throw new HttpError(401, 'Segredo do agendamento inválido.');
      return json({ processed: await processDue(db, null) }, 200, cors);
    }
    const user = await requireUser(request, db);
    const body = await readJson(request);
    if (body.action !== 'run-mine') throw new HttpError(400, 'Ação desconhecida.');
    return json({ processed: await processDue(db, user.id) }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
    logError('publish-worker', error);
    return json({ error: 'Erro inesperado.' }, 500, cors);
  }
});

async function processDue(db: SupabaseClient, userId: string | null): Promise<number> {
  const now = new Date().toISOString();
  // A run that died mid-publish leaves the job "publishing": after 15 minutes it goes back to the queue,
  // and the checkpoint (Instagram, TikTok) or the recent-posts check (Facebook) keeps it from posting twice.
  // YouTube jobs are the studio's: it has its own, longer limit (an upload can take a while).
  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  const { error: staleError } = await db.from('publishing_jobs').update({ status: 'scheduled' }).eq('status', 'publishing').is('data->>uploader', null).lt('updated_at', stale);
  if (staleError) logError('requeue stale jobs', staleError);
  let query = db
    .from('publishing_jobs')
    .select('id')
    .eq('status', 'scheduled')
    .is('data->>uploader', null)
    .lte('scheduled_at', now)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('scheduled_at')
    .limit(BATCH);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw new HttpError(500, 'Não consegui ler a fila.');
  let processed = 0;
  for (const { id } of data ?? []) {
    // Claim: only one run moves the job out of "scheduled".
    const { data: claimed } = await db.from('publishing_jobs').update({ status: 'publishing' }).eq('id', id).eq('status', 'scheduled').select('*').maybeSingle();
    if (!claimed) continue;
    await publishJob(db, claimed as JobRow);
    processed += 1;
  }
  return processed;
}

async function publishJob(db: SupabaseClient, job: JobRow): Promise<void> {
  const attempts = job.attempts + 1;
  try {
    if (!job.approved_at) throw new ProviderError('permission', 'Job sem aprovação: nada foi publicado.');
    const { data: connection } = await db.from('social_connections').select('id, platform, external_id, status').eq('id', job.connection_id).eq('user_id', job.user_id).maybeSingle();
    if (!connection || connection.status !== 'connected') throw new ProviderError('auth', 'A conta não está conectada. Reconecta e aprova de novo.');
    if (job.data.kind === 'video') await publishVideoJob(db, job, connection as Connection, attempts);
    else await publishCarouselJob(db, job, connection as Connection, attempts);
  } catch (error) {
    logError('publish job', error);
    const decision = afterFailure(error, attempts, MAX_ATTEMPTS);
    const message = error instanceof ProviderError ? error.message : 'Falha inesperada ao publicar.';
    const waiting = decision.status === 'scheduled' && !decision.countsAttempt;
    await db
      .from('publishing_jobs')
      .update({
        status: decision.status,
        attempts: waiting ? job.attempts : attempts,
        last_error: decision.status === 'failed' ? message : waiting ? message : `${message} Nova tentativa automática agendada.`,
        next_attempt_at: decision.status === 'scheduled' ? new Date(Date.now() + decision.retryInMinutes * 60_000).toISOString() : null,
      })
      .eq('id', job.id);
    if (decision.status === 'failed' && decision.reconnect) await db.from('social_connections').update({ status: 'expired', last_error: message }).eq('id', job.connection_id);
  }
}

function checkpointSaver(db: SupabaseClient, job: JobRow) {
  return async (checkpoint: Checkpoint & TikTokCheckpoint & VideoCheckpoint) => {
    const { error } = await db.from('publishing_jobs').update({ data: { ...job.data, checkpoint } }).eq('id', job.id);
    if (error) throw new Error(`checkpoint: ${error.message}`);
  };
}

async function markPublished(db: SupabaseClient, job: JobRow, attempts: number, externalId: string | null, permalink: string | null): Promise<void> {
  await db.from('publishing_jobs').update({ status: 'published', attempts, external_id: externalId, permalink, last_error: null, next_attempt_at: null }).eq('id', job.id);
}

async function publishCarouselJob(db: SupabaseClient, job: JobRow, connection: Connection, attempts: number): Promise<void> {
  const media = job.data.media ?? [];
  if (media.length < 1 || media.length > 10) throw new ProviderError('permission', 'A publicação precisa de 1 a 10 imagens aprovadas.');
  const urls: string[] = [];
  for (const path of media) urls.push(await signed(db, 'publish-media', path));

  const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
  const caption = job.data.caption ?? '';
  const saveCheckpoint = checkpointSaver(db, job);

  if (connection.platform === 'tiktok') {
    const tokens = await freshTikTokTokens(db, key, connection.id);
    const publishId = await sendTikTokDraft(
      { accessToken: tokens.accessToken, imageUrls: urls.map((url) => verifiedMediaUrl(url, appUrl())), title: job.data.title || titleFromCaption(caption), caption },
      job.data.checkpoint ?? {},
      { fetchFn: fetch, saveCheckpoint },
    );
    // In the drafts, not live: the carousel stays as it is until the owner posts it and the sync finds the post.
    await markPublished(db, job, attempts, publishId, null);
    await removeMedia(db, media);
    return;
  }
  if (connection.platform === 'youtube') throw new ProviderError('permission', 'O YouTube não recebe carrossel.');

  const tokens = await loadTokenSet(db, key, connection.id);
  const target = { platform: connection.platform, accountId: connection.external_id, accessToken: tokens.accessToken } as const;
  const deps = { env, fetchFn: fetch, saveCheckpoint };
  const result =
    target.platform === 'instagram'
      ? await publishInstagram(target, urls, caption, job.data.checkpoint ?? {}, deps)
      : await publishFacebookPage(target, urls, caption, deps, new Date(job.approved_at!));

  await markPublished(db, job, attempts, result.externalId, result.permalink);
  await recordPublication(db, {
    userId: job.user_id,
    connectionId: job.connection_id,
    platform: connection.platform,
    externalId: result.externalId,
    permalink: result.permalink,
    mediaType: media.length > 1 ? 'carousel' : 'image',
    title: job.data.title ?? '',
    caption,
    carouselId: job.carousel_id,
    videoJobId: null,
  });
  await removeMedia(db, media);
}

/** The rendered files stay in studio-media after publishing: the same video goes to several networks. */
async function publishVideoJob(db: SupabaseClient, job: JobRow, connection: Connection, attempts: number): Promise<void> {
  if (!job.video_job_id) throw new ProviderError('permission', 'Esse agendamento perdeu o vídeo do estúdio.');
  const { data: video } = await db.from('video_jobs').select('outputs, status').eq('id', job.video_job_id).eq('user_id', job.user_id).maybeSingle();
  if (!video || video.status !== 'ready') throw new ProviderError('permission', 'O vídeo não está mais pronto no estúdio (foi refeito ou apagado). Aprova de novo.');
  const outputs = video.outputs as { vertical?: { path?: string | null }; long?: { path?: string | null }; thumbnail?: string; thumbnailVertical?: string };
  const format = job.data.format ?? 'vertical';
  const path = format === 'long' ? outputs.long?.path : outputs.vertical?.path;
  if (!path) throw new ProviderError('permission', format === 'long' ? 'O vídeo longo só existe no PC: ele vai para o YouTube pelo estúdio.' : 'O vertical não está no Storage.');
  const cover = format === 'long' ? outputs.thumbnail : (outputs.thumbnailVertical ?? outputs.thumbnail);

  const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
  const videoUrl = await signed(db, 'studio-media', path);
  const coverUrl = cover ? await signed(db, 'studio-media', cover) : null;
  const caption = job.data.caption ?? '';
  const title = job.data.title || titleFromCaption(caption);
  const saveCheckpoint = checkpointSaver(db, job);
  const checkpoint = job.data.checkpoint ?? {};

  if (connection.platform === 'tiktok') {
    const tokens = await freshTikTokTokens(db, key, connection.id);
    const publishId = await sendTikTokVideoDraft({ accessToken: tokens.accessToken, videoUrl: verifiedMediaUrl(videoUrl, appUrl()) }, checkpoint, { fetchFn: fetch, saveCheckpoint });
    await markPublished(db, job, attempts, publishId, null);
    return;
  }
  if (connection.platform === 'youtube') throw new ProviderError('permission', 'Vídeo para o YouTube é enviado pelo estúdio no PC.');

  const tokens = await loadTokenSet(db, key, connection.id);
  const target = { platform: connection.platform, accountId: connection.external_id, accessToken: tokens.accessToken } as const;
  const input = { videoUrl, coverUrl, caption, title };
  const result: PublishResult =
    target.platform === 'instagram'
      ? await publishInstagramReel(target, input, checkpoint, { env, fetchFn: fetch, saveCheckpoint })
      : await publishFacebookVideo(target, input, { env, fetchFn: fetch, saveCheckpoint }, new Date(job.approved_at!));

  await markPublished(db, job, attempts, result.externalId, result.permalink);
  await recordPublication(db, {
    userId: job.user_id,
    connectionId: job.connection_id,
    platform: connection.platform,
    externalId: result.externalId,
    permalink: result.permalink,
    mediaType: connection.platform === 'instagram' ? 'reel' : 'video',
    title,
    caption,
    carouselId: null,
    videoJobId: job.video_job_id,
  });
}

function appUrl(): string {
  const value = Deno.env.get('APP_URL');
  if (!value) throw new ProviderError('permission', 'Falta o segredo APP_URL: o TikTok só baixa arquivos do site verificado.');
  return value;
}

async function signed(db: SupabaseClient, bucket: string, path: string): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error(`arquivo aprovado não encontrado: ${path}`);
  return data.signedUrl;
}

/** The approved images are only needed until the network has them. */
async function removeMedia(db: SupabaseClient, media: string[]): Promise<void> {
  const { error } = await db.storage.from('publish-media').remove(media);
  if (error) logError('remove published media', error);
}

/** TikTok access tokens last 24 hours: refreshed here too, since the next sync may be hours away. */
async function freshTikTokTokens(db: SupabaseClient, key: CryptoKey, connectionId: string): Promise<TokenSet> {
  const tokens = await loadTokenSet(db, key, connectionId);
  const refreshed = await createProvider('tiktok', env, fetch).refresh(tokens, new Date());
  if (!refreshed) return tokens;
  await saveTokenSet(db, key, connectionId, refreshed);
  return refreshed;
}
