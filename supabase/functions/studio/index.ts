import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { importKey, randomToken, sha256Hex } from '../_shared/crypto.ts';
import { corsHeaders, HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { afterFailure } from '../_shared/publishing/publish.ts';
import { recordPublication } from '../_shared/publishing/record.ts';
import { createProvider } from '../_shared/social/providers.ts';
import { loadTokenSet, saveTokenSet } from '../_shared/social/supabaseStore.ts';
import { ProviderError, type ProviderErrorKind } from '../_shared/social/types.ts';
import { youtubeWatchUrl } from '../_shared/social/youtube.ts';
import { agentPostProblems, agentPublishingRow, agentVideoProblems, type AgentPostInput, type Format, type Platform, type Privacy } from '../_shared/studio/agent.ts';
import {
  isOutputFile,
  OUTPUT_FILES,
  outputFolder,
  resultsBrief,
  sanitizeOutputs,
  staleDecision,
  STUDIO_KEY_PATTERN,
  UPLOAD_STALE_MINUTES,
  youtubeText,
  type MeasuredPost,
} from '../_shared/studio/studio.ts';

/**
 * Bridge between the Fábrica and the local studio (the owner's PC, which renders with Remotion).
 *   With the user's JWT (the app):
 *     {action:'create-key'}  → a new studio key, shown once (only its hash is kept); replaces the previous one
 *     {action:'revoke-key'}  → the studio stops being able to talk to the Fábrica
 *   With header x-studio-key (the studio):
 *     hello, claim, progress, upload-url, complete, fail       → video jobs
 *     youtube-next, youtube-checkpoint, youtube-done, youtube-failed → approved YouTube uploads
 *     agent-overview, agent-request-video, agent-propose-post → the office agent (Jason); its posts always wait for approval
 * The studio never gets the service role nor anyone else's data: every query filters by the key's owner.
 * Deploy with --no-verify-jwt (the studio has no JWT; both paths check their own credential).
 */

const env = { get: (name: string) => Deno.env.get(name) };
const MAX_YT_ATTEMPTS = 3;
const SIGNED_URL_SECONDS = 6 * 3600;
const RESULTS_DAYS = 120;

interface VideoJobRow {
  id: string;
  user_id: string;
  project_id: string | null;
  channel: string;
  mode: 'create' | 'render';
  title: string;
  brief: string;
  formats: string[];
  compositions: Record<string, string>;
  status: string;
  attempts: number;
  heartbeat_at: string | null;
  caption: string;
  outputs: Record<string, unknown>;
}

interface PublishRow {
  id: string;
  user_id: string;
  connection_id: string;
  video_job_id: string | null;
  attempts: number;
  data: Record<string, unknown>;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const body = await readJson(request);
    const studioKey = request.headers.get('x-studio-key');
    if (studioKey !== null) return json(await studioAction(db, await ownerOfKey(db, studioKey), body), 200, cors);

    const user = await requireUser(request, db);
    if (body.action === 'create-key') return json(await createKey(db, user), 200, cors);
    if (body.action === 'revoke-key') {
      const { error } = await db.from('studio_keys').delete().eq('user_id', user.id);
      if (error) throw new HttpError(500, 'Não consegui desligar o estúdio.');
      return json({ ok: true }, 200, cors);
    }
    throw new HttpError(400, 'Ação desconhecida.');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
    logError('studio', error);
    return json({ error: 'Erro inesperado.' }, 500, cors);
  }
});

async function createKey(db: SupabaseClient, user: User): Promise<{ key: string }> {
  const key = `fsk_${randomToken(32)}`;
  const { error } = await db
    .from('studio_keys')
    .upsert({ user_id: user.id, secret_hash: await sha256Hex(key), created_at: new Date().toISOString(), last_seen_at: null, worker_info: null }, { onConflict: 'user_id' });
  if (error) throw new HttpError(500, 'Não consegui gerar a chave do estúdio.');
  return { key };
}

async function ownerOfKey(db: SupabaseClient, key: string): Promise<string> {
  if (!STUDIO_KEY_PATTERN.test(key)) throw new HttpError(401, 'Chave do estúdio inválida.');
  const { data } = await db.from('studio_keys').select('user_id').eq('secret_hash', await sha256Hex(key)).maybeSingle();
  if (!data) throw new HttpError(401, 'Chave do estúdio desconhecida ou trocada. Gera outra na Fábrica, em Estúdio.');
  return data.user_id as string;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const id = (value: unknown) => {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new HttpError(400, 'Pedido inválido.');
  return value;
};

async function studioAction(db: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<unknown> {
  switch (body.action) {
    case 'hello':
      return hello(db, userId, body);
    case 'claim':
      return claim(db, userId, body);
    case 'progress':
      return progress(db, userId, body);
    case 'upload-url':
      return uploadUrl(db, userId, body);
    case 'complete':
      return complete(db, userId, body);
    case 'fail':
      return fail(db, userId, body);
    case 'youtube-next':
      return youtubeNext(db, userId);
    case 'youtube-checkpoint':
      return youtubeCheckpoint(db, userId, body);
    case 'youtube-done':
      return youtubeDone(db, userId, body);
    case 'youtube-failed':
      return youtubeFailed(db, userId, body);
    case 'agent-overview':
      return agentOverview(db, userId);
    case 'agent-request-video':
      return agentRequestVideo(db, userId, body);
    case 'agent-propose-post':
      return agentProposePost(db, userId, body);
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
}

async function hello(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const raw = body.info && typeof body.info === 'object' ? body.info : {};
  const info = JSON.stringify(raw).length <= 2000 ? raw : { note: 'informação grande demais' };
  const { error } = await db.from('studio_keys').update({ last_seen_at: new Date().toISOString(), worker_info: info }).eq('user_id', userId);
  if (error) throw new HttpError(500, 'Não consegui registrar o estúdio.');
  return { ok: true };
}

async function requeueStale(db: SupabaseClient, userId: string): Promise<void> {
  const { data } = await db.from('video_jobs').select('id, status, heartbeat_at, attempts').eq('user_id', userId).eq('status', 'working');
  const now = new Date();
  for (const job of data ?? []) {
    const decision = staleDecision(job, now);
    if (!decision) continue;
    const patch = decision.status === 'queued' ? { status: 'queued', step: 'Voltou para a fila (o estúdio parou de responder)' } : { status: 'failed', last_error: decision.error };
    const { error } = await db.from('video_jobs').update(patch).eq('id', job.id).eq('status', 'working');
    if (error) logError('requeue stale video job', error);
  }
}

async function claim(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const channels = Array.isArray(body.channels) ? body.channels.filter((item): item is string => typeof item === 'string' && /^[a-z0-9-]{1,40}$/.test(item)).slice(0, 30) : [];
  if (!channels.length) throw new HttpError(400, 'O estúdio precisa dizer quais canais sabe fazer.');
  await db.from('studio_keys').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId);
  await requeueStale(db, userId);

  const { data: next } = await db.from('video_jobs').select('id, attempts').eq('user_id', userId).eq('status', 'queued').in('channel', channels).order('created_at').limit(1).maybeSingle();
  if (!next) return { job: null };
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from('video_jobs')
    .update({ status: 'working', attempts: next.attempts + 1, claimed_at: now, heartbeat_at: now, worker: text(body.worker, 80) || 'estudio', step: 'Começando', progress: 0, last_error: null, log: '' })
    .eq('id', next.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();
  if (!claimed) return { job: null };
  const job = claimed as VideoJobRow;

  const { data: project } = job.project_id ? await db.from('projects').select('name, data').eq('id', job.project_id).maybeSingle() : { data: null };
  const description = project?.data && typeof project.data.description === 'string' ? project.data.description.slice(0, 1000) : '';
  return {
    job: {
      id: job.id,
      channel: job.channel,
      mode: job.mode,
      title: job.title,
      brief: job.brief,
      formats: job.formats,
      compositions: job.compositions,
      attempt: job.attempts,
      project: project ? { name: project.name, description } : null,
      folder: outputFolder(userId, job.id, job.attempts),
    },
    results: job.mode === 'create' ? resultsBrief(await measuredPosts(db, userId, job.project_id)) : null,
  };
}

/** Measured posts of the job's project (or of every account, without a project), last reading of each one. */
async function measuredPosts(db: SupabaseClient, userId: string, projectId: string | null): Promise<MeasuredPost[]> {
  let connections = db.from('social_connections').select('id').eq('user_id', userId);
  if (projectId) connections = connections.eq('project_id', projectId);
  const { data: linked } = await connections;
  const connectionIds = (linked ?? []).map((row) => row.id as string);
  if (!connectionIds.length) return [];
  const since = new Date(Date.now() - RESULTS_DAYS * 86_400_000).toISOString();
  const { data: publications } = await db.from('publications').select('id, platform, data').eq('user_id', userId).in('connection_id', connectionIds).gte('published_at', since).order('published_at', { ascending: false }).limit(150);
  const ids = (publications ?? []).map((row) => row.id as string);
  if (!ids.length) return [];
  const { data: readings } = await db.from('publication_metrics').select('publication_id, captured_on, metrics').eq('user_id', userId).in('publication_id', ids).order('captured_on', { ascending: false });
  const latest = new Map<string, Record<string, number>>();
  for (const reading of readings ?? []) if (!latest.has(reading.publication_id)) latest.set(reading.publication_id, reading.metrics as Record<string, number>);
  return (publications ?? []).map((row) => ({
    title: typeof row.data?.title === 'string' ? row.data.title : '',
    caption: typeof row.data?.caption === 'string' ? row.data.caption : '',
    platform: row.platform as string,
    mediaType: typeof row.data?.mediaType === 'string' ? row.data.mediaType : 'other',
    publishedAt: typeof row.data?.publishedAt === 'string' ? row.data.publishedAt : null,
    metrics: latest.get(row.id as string) ?? {},
  }));
}

async function workingJob(db: SupabaseClient, userId: string, jobId: string): Promise<VideoJobRow | null> {
  const { data } = await db.from('video_jobs').select('*').eq('id', jobId).eq('user_id', userId).maybeSingle();
  return data && (data as VideoJobRow).status === 'working' ? (data as VideoJobRow) : null;
}

/** Heartbeat with what the studio is doing. continue:false when the owner cancelled: the studio stops. */
async function progress(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const jobId = id(body.jobId);
  const value = typeof body.progress === 'number' ? Math.max(0, Math.min(99, Math.round(body.progress))) : 0;
  const patch: Record<string, unknown> = { heartbeat_at: new Date().toISOString(), step: text(body.step, 120) || null, progress: value };
  if (typeof body.log === 'string') patch.log = body.log.slice(-20000);
  const { data } = await db.from('video_jobs').update(patch).eq('id', jobId).eq('user_id', userId).eq('status', 'working').select('id').maybeSingle();
  return { continue: Boolean(data) };
}

async function uploadUrl(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const job = await workingJob(db, userId, id(body.jobId));
  if (!job) throw new HttpError(409, 'Esse vídeo não está mais com o estúdio (cancelado ou refeito).');
  if (!isOutputFile(body.name)) throw new HttpError(400, `Arquivo não aceito. Nomes possíveis: ${Object.keys(OUTPUT_FILES).join(', ')}.`);
  const path = `${outputFolder(userId, job.id, job.attempts)}/${body.name}`;
  const { data, error } = await db.storage.from('studio-media').createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new HttpError(500, 'Não consegui preparar o envio do arquivo.');
  return { path, signedUrl: data.signedUrl, contentType: OUTPUT_FILES[body.name] };
}

async function complete(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const job = await workingJob(db, userId, id(body.jobId));
  if (!job) throw new HttpError(409, 'Esse vídeo não está mais com o estúdio (cancelado ou refeito).');
  let outputs;
  try {
    outputs = sanitizeOutputs(body.outputs, outputFolder(userId, job.id, job.attempts), job.formats);
  } catch (error) {
    throw new HttpError(400, `Resultado recusado: ${error instanceof Error ? error.message : 'formato inválido'}.`);
  }
  const caption = text(body.caption, 5000);
  const patch: Record<string, unknown> = { status: 'ready', progress: 100, step: 'Pronto para revisar', heartbeat_at: new Date().toISOString(), outputs };
  // The owner's own caption wins; the studio's suggestion only fills an empty one.
  if (caption && !job.caption.trim()) patch.caption = caption;
  if (typeof body.log === 'string') patch.log = body.log.slice(-20000);
  const { error } = await db.from('video_jobs').update(patch).eq('id', job.id).eq('status', 'working');
  if (error) throw new HttpError(500, 'Não consegui salvar o resultado.');
  return { ok: true };
}

async function fail(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const jobId = id(body.jobId);
  const patch: Record<string, unknown> = { status: 'failed', last_error: text(body.error, 500) || 'O estúdio não conseguiu terminar.', step: null };
  if (typeof body.log === 'string') patch.log = body.log.slice(-20000);
  const { error } = await db.from('video_jobs').update(patch).eq('id', jobId).eq('user_id', userId).eq('status', 'working');
  if (error) throw new HttpError(500, 'Não consegui registrar a falha.');
  return { ok: true };
}

// YouTube uploads ------------------------------------------------------------------------

/** The next approved YouTube job that is due, claimed for this studio, with a fresh access token. */
async function youtubeNext(db: SupabaseClient, userId: string) {
  const now = new Date();
  const stale = new Date(now.getTime() - UPLOAD_STALE_MINUTES * 60_000).toISOString();
  await db.from('publishing_jobs').update({ status: 'scheduled' }).eq('user_id', userId).eq('status', 'publishing').eq('data->>uploader', 'studio').lt('updated_at', stale);

  const iso = now.toISOString();
  const { data: due } = await db
    .from('publishing_jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .eq('data->>uploader', 'studio')
    .lte('scheduled_at', iso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${iso}`)
    .order('scheduled_at')
    .limit(1)
    .maybeSingle();
  if (!due) return { job: null };
  const { data: claimed } = await db.from('publishing_jobs').update({ status: 'publishing' }).eq('id', due.id).eq('status', 'scheduled').select('*').maybeSingle();
  if (!claimed) return { job: null };
  const job = claimed as PublishRow & { approved_at: string | null };

  try {
    if (!job.approved_at) throw new ProviderError('permission', 'Job sem aprovação: nada foi enviado.');
    const { data: connection } = await db.from('social_connections').select('id, platform, status').eq('id', job.connection_id).eq('user_id', userId).maybeSingle();
    if (!connection || connection.platform !== 'youtube' || connection.status !== 'connected') throw new ProviderError('auth', 'O canal do YouTube não está conectado. Reconecta e aprova de novo.');
    if (!job.video_job_id) throw new ProviderError('permission', 'Esse agendamento perdeu o vídeo do estúdio.');
    const { data: video } = await db.from('video_jobs').select('outputs, status, channel').eq('id', job.video_job_id).eq('user_id', userId).maybeSingle();
    if (!video || video.status !== 'ready') throw new ProviderError('permission', 'O vídeo não está mais pronto no estúdio (foi refeito ou apagado). Aprova de novo.');

    const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
    let tokens = await loadTokenSet(db, key, connection.id);
    const refreshed = await createProvider('youtube', env, fetch).refresh(tokens, now);
    if (refreshed) {
      await saveTokenSet(db, key, connection.id, refreshed);
      tokens = refreshed;
    }

    const format = job.data.format === 'long' ? 'long' : 'vertical';
    const outputs = video.outputs as { long?: { localFile?: string | null; path?: string | null }; vertical?: { localFile?: string | null; path?: string | null }; thumbnail?: string };
    const file = format === 'long' ? outputs.long : outputs.vertical;
    const downloadUrl = file?.path ? (await db.storage.from('studio-media').createSignedUrl(file.path, SIGNED_URL_SECONDS)).data?.signedUrl ?? null : null;
    const thumbnailUrl = outputs.thumbnail ? (await db.storage.from('studio-media').createSignedUrl(outputs.thumbnail, SIGNED_URL_SECONDS)).data?.signedUrl ?? null : null;
    const { title, description } = youtubeText(text(job.data.title, 300), text(job.data.caption, 6000));
    return {
      job: {
        id: job.id,
        videoJobId: job.video_job_id,
        channel: video.channel,
        format,
        title,
        description,
        privacy: ['public', 'unlisted', 'private'].includes(job.data.privacy as string) ? job.data.privacy : 'public',
        checkpoint: job.data.checkpoint ?? null,
        localFile: file?.localFile ?? null,
        downloadUrl,
        thumbnailUrl,
      },
      accessToken: tokens.accessToken,
    };
  } catch (error) {
    await recordYoutubeFailure(db, job, error);
    return { job: null, error: error instanceof ProviderError ? error.message : 'Falha ao preparar o envio.' };
  }
}

async function publishingJob(db: SupabaseClient, userId: string, jobId: string): Promise<PublishRow> {
  const { data } = await db.from('publishing_jobs').select('*').eq('id', jobId).eq('user_id', userId).eq('status', 'publishing').eq('data->>uploader', 'studio').maybeSingle();
  if (!data) throw new HttpError(409, 'Esse envio não está mais com o estúdio.');
  return data as PublishRow;
}

/** The resumable upload session, so a retry continues the same upload instead of creating a second video. */
async function youtubeCheckpoint(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const job = await publishingJob(db, userId, id(body.jobId));
  const uploadUrl = text(body.uploadUrl, 2000);
  if (!uploadUrl.startsWith('https://www.googleapis.com/upload/youtube/')) throw new HttpError(400, 'Sessão de envio inválida.');
  const { error } = await db.from('publishing_jobs').update({ data: { ...job.data, checkpoint: { uploadUrl, savedAt: new Date().toISOString() } } }).eq('id', job.id);
  if (error) throw new HttpError(500, 'Não consegui salvar o andamento do envio.');
  return { ok: true };
}

async function youtubeDone(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const job = await publishingJob(db, userId, id(body.jobId));
  if (typeof body.videoId !== 'string' || !/^[\w-]{11}$/.test(body.videoId)) throw new HttpError(400, 'Id de vídeo do YouTube inválido.');
  const permalink = youtubeWatchUrl(body.videoId);
  const { error } = await db.from('publishing_jobs').update({ status: 'published', attempts: job.attempts + 1, external_id: body.videoId, permalink, last_error: null, next_attempt_at: null }).eq('id', job.id);
  if (error) throw new HttpError(500, 'Não consegui marcar como publicado.');
  await recordPublication(db, {
    userId,
    connectionId: job.connection_id,
    platform: 'youtube',
    externalId: body.videoId,
    permalink,
    mediaType: 'video',
    title: text(job.data.title, 200),
    caption: text(job.data.caption, 2200),
    carouselId: null,
    videoJobId: job.video_job_id,
  });
  return { ok: true, permalink };
}

const ERROR_KINDS: ProviderErrorKind[] = ['auth', 'rate_limit', 'permission', 'unavailable', 'processing'];

async function youtubeFailed(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const job = await publishingJob(db, userId, id(body.jobId));
  const kind = ERROR_KINDS.includes(body.kind as ProviderErrorKind) ? (body.kind as ProviderErrorKind) : 'unavailable';
  await recordYoutubeFailure(db, job, new ProviderError(kind, text(body.message, 400) || 'O envio para o YouTube falhou.'));
  return { ok: true };
}

async function recordYoutubeFailure(db: SupabaseClient, job: PublishRow, error: unknown): Promise<void> {
  logError('youtube upload', error);
  const attempts = job.attempts + 1;
  const decision = afterFailure(error, attempts, MAX_YT_ATTEMPTS);
  const message = error instanceof ProviderError ? error.message : 'Falha inesperada ao enviar.';
  const waiting = decision.status === 'scheduled' && !decision.countsAttempt;
  await db
    .from('publishing_jobs')
    .update({
      status: decision.status,
      attempts: waiting ? job.attempts : attempts,
      last_error: decision.status === 'scheduled' && decision.countsAttempt ? `${message} Nova tentativa automática agendada.` : message,
      next_attempt_at: decision.status === 'scheduled' ? new Date(Date.now() + decision.retryInMinutes * 60_000).toISOString() : null,
    })
    .eq('id', job.id);
  if (decision.status === 'failed' && decision.reconnect) await db.from('social_connections').update({ status: 'expired', last_error: message }).eq('id', job.connection_id);
}

// Office agent ---------------------------------------------------------------------------

const AGENT_LIST = 30;

/** What the agent needs to plan posts: ready videos, connected accounts and what is already in the queue. */
async function agentOverview(db: SupabaseClient, userId: string) {
  const [videos, connections, queue] = await Promise.all([
    db.from('video_jobs').select('id, channel, title, caption, formats, outputs, status, updated_at').eq('user_id', userId).in('status', ['queued', 'working', 'ready']).order('updated_at', { ascending: false }).limit(AGENT_LIST),
    db.from('social_connections').select('id, platform, username, display_name, status').eq('user_id', userId).order('platform'),
    db.from('publishing_jobs').select('id, connection_id, video_job_id, status, scheduled_at, data').eq('user_id', userId).in('status', ['awaiting_approval', 'scheduled', 'publishing']).order('scheduled_at').limit(AGENT_LIST),
  ]);
  if (videos.error || connections.error || queue.error) throw new HttpError(500, 'Não consegui ler a Fábrica.');
  return {
    videos: (videos.data ?? []).map((job) => ({
      id: job.id, channel: job.channel, title: job.title, status: job.status, caption: String(job.caption ?? '').slice(0, 600),
      formats: Object.fromEntries((['long', 'vertical'] as const).filter((format) => job.outputs?.[format]).map((format) => [format, Math.round(Number(job.outputs[format].durationSec ?? 0))])),
    })),
    connections: connections.data ?? [],
    queue: (queue.data ?? []).map((job) => ({ id: job.id, connectionId: job.connection_id, videoJobId: job.video_job_id, status: job.status, scheduledAt: job.scheduled_at, postAt: job.data?.postAt ?? job.scheduled_at })),
  };
}

async function agentRequestVideo(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const request = {
    channel: text(body.channel, 40),
    title: text(body.title, 200).trim(),
    brief: text(body.brief, 5000).trim(),
    formats: Array.isArray(body.formats) ? [...new Set(body.formats.filter((item): item is Format => item === 'long' || item === 'vertical'))] : [],
    projectId: typeof body.projectId === 'string' && body.projectId ? id(body.projectId) : null,
  };
  const problems = agentVideoProblems(request);
  if (problems.length) throw new HttpError(422, problems.join(' '));
  if (request.projectId) {
    const { data } = await db.from('projects').select('id').eq('id', request.projectId).eq('user_id', userId).maybeSingle();
    if (!data) throw new HttpError(404, 'Projeto não encontrado.');
  }
  const { data, error } = await db
    .from('video_jobs')
    .insert({ user_id: userId, project_id: request.projectId, channel: request.channel, mode: 'create', title: request.title, brief: request.brief, formats: request.formats })
    .select('id, status')
    .single();
  if (error) throw new HttpError(500, 'Não consegui criar o pedido de vídeo.');
  return data;
}

async function agentProposePost(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const postAt = new Date(text(body.postAt, 40));
  if (Number.isNaN(postAt.getTime())) throw new HttpError(400, 'Horário inválido (use ISO, ex.: 2026-10-25T19:00:00-03:00).');
  const privacy: Privacy = body.privacy === 'unlisted' || body.privacy === 'private' ? body.privacy : 'public';
  const input: AgentPostInput = {
    videoJobId: id(body.videoJobId),
    connectionId: id(body.connectionId),
    format: body.format === 'long' ? 'long' : 'vertical',
    title: text(body.title, 200),
    caption: text(body.caption, 6000),
    privacy,
    postAt,
  };
  const [{ data: job }, { data: connection }] = await Promise.all([
    db.from('video_jobs').select('status, outputs').eq('id', input.videoJobId).eq('user_id', userId).maybeSingle(),
    db.from('social_connections').select('platform, status').eq('id', input.connectionId).eq('user_id', userId).maybeSingle(),
  ]);
  if (!job) throw new HttpError(404, 'Vídeo não encontrado.');
  if (!connection) throw new HttpError(404, 'Conta não encontrada.');
  const platform = connection.platform as Platform;
  const problems = agentPostProblems({ job: { status: job.status, outputs: job.outputs ?? {} }, connection: { platform, status: connection.status } }, input, new Date());
  if (problems.length) throw new HttpError(422, problems.join(' '));
  const { data, error } = await db.from('publishing_jobs').insert(agentPublishingRow(userId, platform, input)).select('id, status, scheduled_at').single();
  if (error?.code === '23505') throw new HttpError(409, 'Esse vídeo já está na fila para essa conta nesse horário.');
  if (error) throw new HttpError(500, 'Não consegui colocar na fila.');
  return { ...data, note: 'Na fila aguardando a aprovação da dona na Fábrica.' };
}
