import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { importKey, safeEqual } from '../_shared/crypto.ts';
import { corsHeaders, HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { createProvider } from '../_shared/social/providers.ts';
import { supabaseSyncStore } from '../_shared/social/supabaseStore.ts';
import { syncConnection, type SyncResult } from '../_shared/social/sync.ts';
import type { SocialPlatform } from '../_shared/social/types.ts';

/**
 * Reads profiles, posts and their metrics from the connected accounts.
 *   POST {connectionId} with the user's JWT → manual sync of one connection (at most every 5 minutes)
 *   POST with header x-cron-secret         → scheduled sync of the connections not read in SYNC_INTERVAL_HOURS
 * Deploy with --no-verify-jwt (the cron call has no user JWT; both paths check their own credential).
 */

const env = { get: (name: string) => Deno.env.get(name) };
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;
const SCHEDULED_BATCH = 10;

interface ConnectionRecord {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  external_id: string;
  last_sync_at: string | null;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const cronSecret = Deno.env.get('CRON_SECRET');
    const given = request.headers.get('x-cron-secret');
    if (given !== null) {
      if (!cronSecret || !safeEqual(given, cronSecret)) throw new HttpError(401, 'Segredo do agendamento inválido.');
      return json({ results: await scheduled(db) }, 200, cors);
    }

    const user = await requireUser(request, db);
    const body = await readJson(request);
    if (typeof body.connectionId !== 'string') throw new HttpError(400, 'Conexão inválida.');
    const { data: connection } = await db.from('social_connections').select('id, user_id, platform, external_id, last_sync_at, status').eq('id', body.connectionId).eq('user_id', user.id).maybeSingle();
    if (!connection) throw new HttpError(404, 'Conexão não encontrada.');
    if (connection.status === 'expired') throw new HttpError(409, 'A autorização expirou. Reconecta a conta antes de sincronizar.');

    const { data: lastRun } = await db.from('sync_runs').select('started_at').eq('connection_id', connection.id).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (lastRun && Date.now() - new Date(lastRun.started_at).getTime() < MANUAL_COOLDOWN_MS) {
      throw new HttpError(429, 'Essa conta acabou de sincronizar. Espera 5 minutos pra não gastar a cota da API.');
    }
    return json(await run(db, connection as ConnectionRecord, 'manual'), 200, cors);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
    logError('social-sync', error);
    return json({ error: 'Erro inesperado.' }, 500, cors);
  }
});

async function run(db: SupabaseClient, connection: ConnectionRecord, trigger: 'manual' | 'schedule'): Promise<SyncResult> {
  const { data: runRow, error } = await db.from('sync_runs').insert({ user_id: connection.user_id, connection_id: connection.id, trigger }).select('id').single();
  if (error) throw new HttpError(500, 'Não consegui registrar a sincronização.');
  const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
  const store = supabaseSyncStore(db, key, connection.user_id, runRow.id);
  return syncConnection(
    store,
    createProvider(connection.platform, env, fetch),
    { id: connection.id, userId: connection.user_id, platform: connection.platform, externalId: connection.external_id, lastSyncAt: connection.last_sync_at },
    new Date(),
  );
}

async function scheduled(db: SupabaseClient): Promise<{ connectionId: string; status: string }[]> {
  const hours = Number(Deno.env.get('SYNC_INTERVAL_HOURS') ?? '6');
  const due = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('social_connections')
    .select('id, user_id, platform, external_id, last_sync_at')
    .eq('status', 'connected')
    .or(`last_sync_at.is.null,last_sync_at.lt.${due}`)
    .order('last_sync_at', { ascending: true, nullsFirst: true })
    .limit(SCHEDULED_BATCH);
  if (error) throw new HttpError(500, 'Não consegui listar as conexões.');
  const results = [];
  // One at a time: the accounts share the app's quota on each network.
  for (const connection of (data ?? []) as ConnectionRecord[]) {
    try {
      const result = await run(db, connection, 'schedule');
      results.push({ connectionId: connection.id, status: result.status });
    } catch (cause) {
      logError('scheduled sync', cause);
      results.push({ connectionId: connection.id, status: 'error' });
    }
  }
  const { error: purgeError } = await db.rpc('purge_sync_housekeeping');
  if (purgeError) logError('purge housekeeping', purgeError);
  return results;
}
