import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { decrypt, encrypt } from '../crypto.ts';
import { normalizePermalink, titleFromCaption } from './permalink.ts';
import type { PublicationUpsert, SyncResult, SyncStore } from './sync.ts';
import type { ProviderAccount, TokenSet } from './types.ts';

/** Postgres side of a sync, with the service role: every write carries the user id of the connection. */

const iso = (date: Date | null) => (date ? date.toISOString() : null);
const date = (value: string | null) => (value ? new Date(value) : null);

function check(action: string, error: { message: string } | null): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function required<T>(action: string, data: T | null, error: { message: string } | null): T {
  check(action, error);
  if (data === null) throw new Error(`${action}: nada foi devolvido.`);
  return data;
}

export async function saveTokenSet(db: SupabaseClient, key: CryptoKey, connectionId: string, tokens: TokenSet): Promise<void> {
  const { error } = await db.from('social_tokens').upsert({
    connection_id: connectionId,
    access_token_enc: await encrypt(key, tokens.accessToken),
    refresh_token_enc: tokens.refreshToken ? await encrypt(key, tokens.refreshToken) : null,
    updated_at: new Date().toISOString(),
  });
  check('salvar token', error);
  const { error: connectionError } = await db
    .from('social_connections')
    .update({ token_expires_at: iso(tokens.expiresAt), refresh_expires_at: iso(tokens.refreshExpiresAt), ...(tokens.scopes.length ? { scopes: tokens.scopes } : {}) })
    .eq('id', connectionId);
  check('atualizar validade do token', connectionError);
}

export async function loadTokenSet(db: SupabaseClient, key: CryptoKey, connectionId: string): Promise<TokenSet> {
  const { data: row, error } = await db.from('social_tokens').select('access_token_enc, refresh_token_enc').eq('connection_id', connectionId).maybeSingle();
  check('ler token', error);
  if (!row) throw new Error('Conexão sem token guardado.');
  const result = await db.from('social_connections').select('token_expires_at, refresh_expires_at, scopes').eq('id', connectionId).single();
  const connection = required('ler conexão', result.data, result.error);
  return {
    accessToken: await decrypt(key, row.access_token_enc),
    refreshToken: row.refresh_token_enc ? await decrypt(key, row.refresh_token_enc) : null,
    expiresAt: date(connection.token_expires_at),
    refreshExpiresAt: date(connection.refresh_expires_at),
    scopes: connection.scopes ?? [],
  };
}

export function supabaseSyncStore(db: SupabaseClient, key: CryptoKey, userId: string, runId: number): SyncStore {
  return {
    loadTokens: (connectionId) => loadTokenSet(db, key, connectionId),
    saveTokens: (connectionId, tokens) => saveTokenSet(db, key, connectionId, tokens),

    async updateProfile(connectionId: string, account: ProviderAccount) {
      const { error } = await db
        .from('social_connections')
        .update({ username: account.username, display_name: account.displayName, avatar_url: account.avatarUrl })
        .eq('id', connectionId)
        .eq('user_id', userId);
      check('atualizar perfil', error);
    },

    async saveAccountMetrics(connectionId, day, metrics) {
      const { error } = await db
        .from('account_metrics')
        .upsert({ connection_id: connectionId, user_id: userId, captured_on: day, metrics, captured_at: new Date().toISOString() }, { onConflict: 'connection_id,captured_on' });
      check('salvar métricas da conta', error);
    },

    async upsertPublication(owner: string, { platform, connectionId, post }: PublicationUpsert) {
      const permalink = normalizePermalink(post.permalink);
      const facts = {
        externalId: post.externalId,
        permalink,
        connectionId,
        caption: post.caption.slice(0, 2200),
        mediaType: post.mediaType,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt,
      };
      const columns = { platform, external_id: post.externalId, permalink, connection_id: connectionId, published_at: post.publishedAt };

      const { data: byId, error: byIdError } = await db.from('publications').select('id, data').eq('user_id', owner).eq('platform', platform).eq('external_id', post.externalId).maybeSingle();
      check('procurar publicação', byIdError);
      // A post linked by hand with its URL only has no id yet: the sync finds it by the URL and completes it.
      let existing = byId;
      if (!existing && permalink) {
        const { data: byLink, error: byLinkError } = await db.from('publications').select('id, data').eq('user_id', owner).eq('platform', platform).eq('permalink', permalink).is('external_id', null).maybeSingle();
        check('procurar publicação pelo link', byLinkError);
        existing = byLink;
      }

      if (existing) {
        const { error } = await db.from('publications').update({ ...columns, data: { ...existing.data, ...facts } }).eq('id', existing.id);
        check('atualizar publicação', error);
        return existing.id as string;
      }
      const data = { ...facts, platform, carouselId: null, recordId: null, title: titleFromCaption(post.caption), source: 'sync' };
      const created = await db.from('publications').insert({ ...columns, user_id: owner, source: 'sync', data }).select('id').single();
      return required('criar publicação', created.data, created.error).id as string;
    },

    async savePostMetrics(publicationId, owner, day, metrics) {
      const { error } = await db
        .from('publication_metrics')
        .upsert({ publication_id: publicationId, user_id: owner, captured_on: day, metrics, captured_at: new Date().toISOString() }, { onConflict: 'publication_id,captured_on' });
      check('salvar métricas do post', error);
    },

    async finish(connectionId: string, result: SyncResult) {
      const synced = result.status === 'ok' || result.status === 'partial';
      const { error } = await db
        .from('social_connections')
        .update({
          status: result.connectionStatus,
          last_error: result.error,
          rate_limit: result.usage,
          ...(synced ? { last_sync_at: result.finishedAt } : {}),
        })
        .eq('id', connectionId);
      check('atualizar conexão', error);
      const { error: runError } = await db
        .from('sync_runs')
        .update({ finished_at: result.finishedAt, status: result.status, publications: result.publications, error: result.error, rate_limit: result.usage })
        .eq('id', runId);
      check('registrar sincronização', runError);
    },
  };
}
