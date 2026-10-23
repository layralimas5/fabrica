import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { importKey, randomToken } from '../_shared/crypto.ts';
import { corsHeaders, HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { configStatus, createProvider, isPlatform, PLATFORMS } from '../_shared/social/providers.ts';
import { loadTokenSet, saveTokenSet } from '../_shared/social/supabaseStore.ts';
import { ProviderError, type SocialPlatform } from '../_shared/social/types.ts';

/**
 * Official OAuth for our own accounts. The app never sees a password nor a token:
 *   POST {action:'config'}                → which networks have their secrets set (names only)
 *   POST {action:'start', platform, ...}  → authorization URL with a single-use state
 *   GET  /social-oauth/callback/<platform> → the network comes back here; tokens are encrypted and stored
 *   POST {action:'disconnect', ...}       → removes the tokens (and the synced data, if asked)
 * Deploy with --no-verify-jwt: the callback has no JWT, and POSTs check the user themselves.
 */

const env = { get: (name: string) => Deno.env.get(name) };
const MAX_OPEN_STATES = 5;

Deno.serve(async (request) => {
  const cors = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  const url = new URL(request.url);

  const callback = url.pathname.match(/\/callback\/(instagram|facebook|tiktok|youtube)\/?$/);
  if (request.method === 'GET' && callback) return handleCallback(db, callback[1] as SocialPlatform, url);

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const user = await requireUser(request, db);
    const body = await readJson(request);
    switch (body.action) {
      case 'config':
        return json({ ...configStatus(env, fetch), redirectUris: Object.fromEntries(PLATFORMS.map((p) => [p, redirectUri(p)])) }, 200, cors);
      case 'start':
        return json(await start(db, user, body), 200, cors);
      case 'disconnect':
        await disconnect(db, user, body);
        return json({ ok: true }, 200, cors);
      default:
        throw new HttpError(400, 'Ação desconhecida.');
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
    logError('social-oauth', error);
    return json({ error: 'Erro inesperado.' }, 500, cors);
  }
});

function redirectUri(platform: SocialPlatform): string {
  const base = Deno.env.get('OAUTH_REDIRECT_BASE') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/social-oauth`;
  return `${base}/callback/${platform}`;
}

/** Only paths of the app itself: never an absolute URL, so the callback cannot be used to redirect elsewhere. */
function safeReturnTo(raw: unknown): string {
  return typeof raw === 'string' && /^\/[a-z0-9/_-]*$/i.test(raw) ? raw : '/contas';
}

async function start(db: SupabaseClient, user: User, body: Record<string, unknown>) {
  if (!isPlatform(body.platform)) throw new HttpError(400, 'Rede social inválida.');
  const platform = body.platform;
  const config = configStatus(env, fetch)[platform];
  if (!config.configured) throw new HttpError(409, `Configuração pendente: faltam ${config.missing.join(', ')}.`);

  const { count, error: countError } = await db.from('oauth_states').select('state', { count: 'exact', head: true }).eq('user_id', user.id).gt('expires_at', new Date().toISOString());
  if (countError) throw new HttpError(500, 'Não consegui iniciar a conexão.');
  if ((count ?? 0) >= MAX_OPEN_STATES) throw new HttpError(429, 'Muitas conexões abertas ao mesmo tempo. Espera 10 minutos ou termina as abertas.');

  let projectId: string | null = null;
  if (typeof body.projectId === 'string' && body.projectId) {
    const { data } = await db.from('projects').select('id').eq('id', body.projectId).eq('user_id', user.id).maybeSingle();
    projectId = data?.id ?? null;
  }

  const state = randomToken(32);
  const { error } = await db.from('oauth_states').insert({ state, user_id: user.id, platform, project_id: projectId, return_to: safeReturnTo(body.returnTo) });
  if (error) throw new HttpError(500, 'Não consegui iniciar a conexão.');
  return { url: createProvider(platform, env, fetch).authorizeUrl(state, redirectUri(platform)) };
}

function backToApp(returnTo: string, params: Record<string, string>): Response {
  const target = new URL(returnTo, Deno.env.get('APP_URL') ?? 'http://localhost:5320');
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
}

async function handleCallback(db: SupabaseClient, platform: SocialPlatform, url: URL): Promise<Response> {
  const stateValue = url.searchParams.get('state') ?? '';
  const { data: state } = stateValue ? await db.from('oauth_states').select('*').eq('state', stateValue).maybeSingle() : { data: null };
  if (!state) return backToApp('/contas', { conexao: 'erro', rede: platform, motivo: 'Link de conexão inválido ou já usado. Começa de novo.' });
  // Single use: the state is gone before anything else happens.
  await db.from('oauth_states').delete().eq('state', stateValue);

  const returnTo = safeReturnTo(state.return_to);
  if (state.platform !== platform || new Date(state.expires_at) < new Date()) return backToApp(returnTo, { conexao: 'erro', rede: platform, motivo: 'A conexão demorou demais. Começa de novo.' });
  const denied = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (denied || !code) return backToApp(returnTo, { conexao: 'erro', rede: platform, motivo: 'A autorização foi cancelada na rede social.' });

  try {
    const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
    const authorized = await createProvider(platform, env, fetch).exchangeCode(code, redirectUri(platform));
    for (const { account, tokens } of authorized) {
      const { data: connection, error } = await db
        .from('social_connections')
        .upsert(
          {
            user_id: state.user_id,
            platform,
            external_id: account.externalId,
            username: account.username,
            display_name: account.displayName,
            avatar_url: account.avatarUrl,
            project_id: state.project_id,
            scopes: tokens.scopes,
            status: 'connected',
            last_error: null,
          },
          { onConflict: 'user_id,platform,external_id' },
        )
        .select('id')
        .single();
      if (error) throw new Error(`salvar conexão: ${error.message}`);
      await saveTokenSet(db, key, connection.id, tokens);
    }
    return backToApp(returnTo, { conexao: 'ok', rede: platform, contas: String(authorized.length) });
  } catch (error) {
    logError('oauth callback', error);
    const reason = error instanceof ProviderError ? error.message : 'Não consegui concluir a conexão. Tenta de novo.';
    return backToApp(returnTo, { conexao: 'erro', rede: platform, motivo: reason });
  }
}

async function disconnect(db: SupabaseClient, user: User, body: Record<string, unknown>): Promise<void> {
  if (typeof body.connectionId !== 'string') throw new HttpError(400, 'Conexão inválida.');
  const { data: connection } = await db.from('social_connections').select('id, platform').eq('id', body.connectionId).eq('user_id', user.id).maybeSingle();
  if (!connection) throw new HttpError(404, 'Conexão não encontrada.');

  try {
    const key = await importKey(Deno.env.get('TOKEN_ENCRYPTION_KEY'));
    await createProvider(connection.platform, env, fetch).revoke(await loadTokenSet(db, key, connection.id));
  } catch (error) {
    // Revoking is a courtesy to the network: the tokens are deleted below either way.
    logError('revoke', error);
  }

  if (body.deleteData === true) {
    const { error } = await db.from('publications').delete().eq('user_id', user.id).eq('connection_id', connection.id).eq('source', 'sync');
    if (error) throw new HttpError(500, 'Não consegui apagar os posts sincronizados.');
  }
  // Tokens, account metrics and sync logs go with the connection (on delete cascade).
  const { error } = await db.from('social_connections').delete().eq('id', connection.id).eq('user_id', user.id);
  if (error) throw new HttpError(500, 'Não consegui desconectar.');
}
