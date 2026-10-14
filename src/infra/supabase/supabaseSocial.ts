import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';
import type { SocialService } from '../../application/ports';
import type { SocialConfig, SocialConnection, SyncRun } from '../../domain/social/connection';
import { ACCOUNT_METRIC_KEYS, POST_METRIC_KEYS, sanitizeMetrics, type AccountSnapshot, type PostSnapshot } from '../../domain/social/metrics';
import type { SocialPlatform } from '../../domain/social/publication';
import { fail } from './supabaseServices';

/** Thrown when a function of the Fábrica is not deployed yet: the screens show "configuração pendente". */
export class FunctionMissingError extends Error {}

/** Calls an Edge Function and turns its JSON error into a readable message. */
export async function invokeFunction<T>(client: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 404 && !payload?.error) throw new FunctionMissingError(`A função ${name} ainda não foi publicada no Supabase.`);
    throw new Error(payload?.error ?? `A função ${name} respondeu ${response.status}.`);
  }
  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) throw new FunctionMissingError(`Não consegui falar com a função ${name}. Ela já foi publicada?`);
  throw new Error(error.message);
}

interface ConnectionRow {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  account_id: string | null;
  project_id: string | null;
  scopes: string[];
  status: SocialConnection['status'];
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  rate_limit: SocialConnection['rateLimit'];
  created_at: string;
}

const rowToConnection = (row: ConnectionRow): SocialConnection => ({
  id: row.id,
  platform: row.platform,
  externalId: row.external_id,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  accountId: row.account_id,
  projectId: row.project_id,
  scopes: row.scopes ?? [],
  status: row.status,
  tokenExpiresAt: row.token_expires_at,
  refreshExpiresAt: row.refresh_expires_at,
  lastSyncAt: row.last_sync_at,
  lastError: row.last_error,
  rateLimit: row.rate_limit,
  createdAt: row.created_at,
});

/** Columns a user may read: never the token table (it has no policy at all). */
const CONNECTION_COLUMNS =
  'id, platform, external_id, username, display_name, avatar_url, account_id, project_id, scopes, status, token_expires_at, refresh_expires_at, last_sync_at, last_error, rate_limit, created_at';
const PAGE = 1000;

export class SupabaseSocial implements SocialService {
  readonly available = true;

  constructor(private readonly client: SupabaseClient) {}

  config(): Promise<SocialConfig> {
    return invokeFunction<SocialConfig>(this.client, 'social-oauth', { action: 'config' });
  }

  async listConnections(): Promise<SocialConnection[]> {
    const { data, error } = await this.client.from('social_connections').select(CONNECTION_COLUMNS).order('created_at');
    if (error) fail('Não consegui carregar as contas conectadas', error);
    return (data as ConnectionRow[]).map(rowToConnection);
  }

  async startConnection(platform: SocialPlatform, projectId: string | null): Promise<string> {
    const { url } = await invokeFunction<{ url: string }>(this.client, 'social-oauth', { action: 'start', platform, projectId, returnTo: '/conexoes' });
    return url;
  }

  async disconnect(connectionId: string, deleteData: boolean): Promise<void> {
    await invokeFunction(this.client, 'social-oauth', { action: 'disconnect', connectionId, deleteData });
  }

  sync(connectionId: string) {
    return invokeFunction<{ status: SyncRun['status']; publications: number; error: string | null }>(this.client, 'social-sync', { connectionId });
  }

  async updateLinks(connectionId: string, links: { accountId: string | null; projectId: string | null }): Promise<void> {
    const { error } = await this.client.from('social_connections').update({ account_id: links.accountId, project_id: links.projectId }).eq('id', connectionId);
    if (error) fail('Não consegui salvar o vínculo da conta', error);
  }

  async listRuns(limit: number): Promise<SyncRun[]> {
    const { data, error } = await this.client.from('sync_runs').select('id, connection_id, trigger, started_at, finished_at, status, publications, error').order('started_at', { ascending: false }).limit(limit);
    if (error) fail('Não consegui carregar o histórico de sincronização', error);
    return (data as { id: number; connection_id: string; trigger: SyncRun['trigger']; started_at: string; finished_at: string | null; status: SyncRun['status']; publications: number; error: string | null }[]).map((row) => ({
      id: row.id,
      connectionId: row.connection_id,
      trigger: row.trigger,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      publications: row.publications,
      error: row.error,
    }));
  }

  async postSnapshots(sinceDay: string): Promise<PostSnapshot[]> {
    const rows = await this.pages<{ publication_id: string; captured_on: string; metrics: unknown; captured_at: string }>('publication_metrics', 'publication_id, captured_on, metrics, captured_at', sinceDay);
    return rows.map((row) => ({ publicationId: row.publication_id, day: row.captured_on, metrics: sanitizeMetrics(row.metrics, POST_METRIC_KEYS), capturedAt: row.captured_at }));
  }

  async accountSnapshots(sinceDay: string): Promise<AccountSnapshot[]> {
    const rows = await this.pages<{ connection_id: string; captured_on: string; metrics: unknown; captured_at: string }>('account_metrics', 'connection_id, captured_on, metrics, captured_at', sinceDay);
    return rows.map((row) => ({ connectionId: row.connection_id, day: row.captured_on, metrics: sanitizeMetrics(row.metrics, ACCOUNT_METRIC_KEYS), capturedAt: row.captured_at }));
  }

  /** PostgREST returns at most 1000 rows per call. */
  private async pages<T>(table: string, columns: string, sinceDay: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client.from(table).select(columns).gte('captured_on', sinceDay).order('captured_on').range(from, from + PAGE - 1);
      if (error) fail('Não consegui carregar as métricas sincronizadas', error);
      rows.push(...(data as T[]));
      if ((data as T[]).length < PAGE) return rows;
    }
  }
}
