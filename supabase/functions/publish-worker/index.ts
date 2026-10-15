import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importKey, safeEqual } from '../_shared/crypto.ts';
import { corsHeaders, HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { afterFailure, publishFacebookPage, publishInstagram, type Checkpoint } from '../_shared/publishing/publish.ts';
import { normalizePermalink, titleFromCaption } from '../_shared/social/permalink.ts';
import { loadTokenSet } from '../_shared/social/supabaseStore.ts';
import { ProviderError } from '../_shared/social/types.ts';

/**
 * Publishes approved jobs that are due.
 *   POST with x-cron-secret          → every user's due jobs (scheduled every few minutes by pg_cron)
 *   POST {action:'run-mine'} + JWT   → the user's own due jobs, now
 * A job is claimed atomically (scheduled → publishing), so two runs never publish the same post.
 * Deploy with --no-verify-jwt.
 */

const env = { get: (name: string) => Deno.env.get(name) };
const MAX_ATTEMPTS = 3;
const BATCH = 5;
const SIGNED_URL_SECONDS = 3600;

interface JobRow {
  id: string;
  user_id: string;
  connection_id: string;
  carousel_id: string | null;
  attempts: number;
  scheduled_at: string;
  approved_at: string | null;
  data: { caption?: string; media?: string[]; title?: string; checkpoint?: Checkpoint };
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
  // and the checkpoint (Instagram) or the recent-posts check (Facebook) keeps it from posting twice.
  const stale = new Date(Date.now() - 15 * 60_000).toISOString();
  const { error: staleError } = await db.from('publishing_jobs').update({ status: 'scheduled' }).eq('status', 'publishing').lt('updated_at', stale);
  if (staleError) logError('requeue stale jobs', staleError);
  let query = db.from('publishing_jobs').select('id').eq('status', 'scheduled').lte('scheduled_at', now).or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order('scheduled_at').limit(BATCH);
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
    if (connection.platform !== 'instagram' && connection.platform !== 'facebook') throw new ProviderError('permission', 'Essa rede não tem publicação automática liberada.');

    const media = job.data.media ?? [];
    if (media.length < 1 || media.length > 10) throw new ProviderError('permission', 'A publicação precisa de 1 a 10 imagens aprovadas.');
    const urls: string[] = [];
    for (const path of media) {
      const { data: signed, error } = await db.storage.from('publish-media').createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error || !signed) throw new Error(`imagem aprovada não encontrada: ${path}`);
      urls.push(signed.signedUrl);
    }

    const tokens = await loadTokenSet(db, await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY')), connection.id);
    const target = { platform: connection.platform, accountId: connection.external_id, accessToken: tokens.accessToken } as const;
    const caption = job.data.caption ?? '';
    const deps = {
      env,
      fetchFn: fetch,
      saveCheckpoint: async (checkpoint: Checkpoint) => {
        const { error } = await db.from('publishing_jobs').update({ data: { ...job.data, checkpoint } }).eq('id', job.id);
        if (error) throw new Error(`checkpoint: ${error.message}`);
      },
    };
    const result =
      target.platform === 'instagram'
        ? await publishInstagram(target, urls, caption, job.data.checkpoint ?? {}, deps)
        : await publishFacebookPage(target, urls, caption, deps, new Date(job.approved_at));

    await db.from('publishing_jobs').update({ status: 'published', attempts, external_id: result.externalId, permalink: result.permalink, last_error: null, next_attempt_at: null }).eq('id', job.id);
    await recordPublication(db, job, connection.platform, result.externalId, result.permalink);
    // The approved images are only needed until the network has them.
    const { error: removeError } = await db.storage.from('publish-media').remove(media);
    if (removeError) logError('remove published media', removeError);
  } catch (error) {
    logError('publish job', error);
    const decision = afterFailure(error, attempts, MAX_ATTEMPTS);
    const message = error instanceof ProviderError ? error.message : 'Falha inesperada ao publicar.';
    await db
      .from('publishing_jobs')
      .update({
        status: decision.status,
        attempts,
        last_error: decision.status === 'failed' ? message : `${message} Nova tentativa automática agendada.`,
        next_attempt_at: decision.status === 'scheduled' ? new Date(Date.now() + decision.retryInMinutes * 60_000).toISOString() : null,
      })
      .eq('id', job.id);
    if (decision.status === 'failed' && decision.reconnect) await db.from('social_connections').update({ status: 'expired', last_error: message }).eq('id', job.connection_id);
  }
}

/** The new post enters the Painel linked to its carousel; the next sync fills in its numbers. */
async function recordPublication(db: SupabaseClient, job: JobRow, platform: 'instagram' | 'facebook', externalId: string | null, permalink: string | null): Promise<void> {
  if (externalId) {
    const caption = job.data.caption ?? '';
    const data = {
      platform,
      externalId,
      permalink: normalizePermalink(permalink),
      connectionId: job.connection_id,
      carouselId: job.carousel_id,
      recordId: null,
      title: job.data.title || titleFromCaption(caption),
      caption,
      mediaType: (job.data.media ?? []).length > 1 ? 'carousel' : 'image',
      thumbnailUrl: null,
      publishedAt: new Date().toISOString(),
      source: 'sync',
    };
    // The unique index on external ids is partial, so this is "find, then insert" instead of an upsert.
    const { data: existing } = await db.from('publications').select('id').eq('user_id', job.user_id).eq('platform', platform).eq('external_id', externalId).maybeSingle();
    const row = { user_id: job.user_id, platform, external_id: externalId, permalink: data.permalink, connection_id: job.connection_id, carousel_id: job.carousel_id, published_at: data.publishedAt, source: 'sync', data };
    const { error } = existing ? await db.from('publications').update(row).eq('id', existing.id) : await db.from('publications').insert(row);
    if (error) logError('record publication', error);
  }
  if (job.carousel_id) {
    const { error } = await db.from('carousels').update({ status: 'published' }).eq('id', job.carousel_id).eq('user_id', job.user_id).in('status', ['draft', 'editing', 'ready']);
    if (error) logError('mark carousel published', error);
  }
}
