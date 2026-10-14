import { ProviderError, type AccountMetrics, type PostMetrics, type Provider, type ProviderAccount, type ProviderPost, type RateUsage, type SocialPlatform, type TokenSet } from './types.ts';

/**
 * One sync of a connected account: refresh the token when needed, read the profile and the recent posts,
 * and store today's numbers. Storage is behind `SyncStore`, so the steps are tested without a database.
 */

export interface ConnectionRow {
  id: string;
  userId: string;
  platform: SocialPlatform;
  externalId: string;
  lastSyncAt: string | null;
}

export interface PublicationUpsert {
  platform: SocialPlatform;
  connectionId: string;
  post: ProviderPost;
}

export interface SyncStore {
  loadTokens(connectionId: string): Promise<TokenSet>;
  saveTokens(connectionId: string, tokens: TokenSet): Promise<void>;
  updateProfile(connectionId: string, account: ProviderAccount): Promise<void>;
  saveAccountMetrics(connectionId: string, day: string, metrics: AccountMetrics): Promise<void>;
  /** Inserts or updates the post (keeping its link to a content) and returns its id. */
  upsertPublication(userId: string, item: PublicationUpsert): Promise<string>;
  savePostMetrics(publicationId: string, userId: string, day: string, metrics: PostMetrics): Promise<void>;
  finish(connectionId: string, result: SyncResult): Promise<void>;
}

export type SyncStatus = 'ok' | 'partial' | 'error' | 'rate_limited';

export interface SyncResult {
  status: SyncStatus;
  publications: number;
  /** Connection status after the run: an auth refusal means the user must reconnect. */
  connectionStatus: 'connected' | 'expired' | 'error';
  error: string | null;
  usage: RateUsage;
  finishedAt: string;
}

/** First sync reads 90 days; later ones re-read 30 days, which is when most posts still grow. */
export const FIRST_SYNC_DAYS = 90;
export const RESYNC_DAYS = 30;
/** Above this Meta usage percentage the sync stops early and leaves the rest for the next run. */
export const USAGE_CEILING = 80;

export function syncWindowStart(lastSyncAt: string | null, now: Date): Date {
  const days = lastSyncAt ? RESYNC_DAYS : FIRST_SYNC_DAYS;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Day in São Paulo time: a post read at 23:30 belongs to that day, not to the next UTC day. */
export function localDay(date: Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export async function syncConnection(store: SyncStore, provider: Provider, connection: ConnectionRow, now: Date): Promise<SyncResult> {
  const day = localDay(now);
  let saved = 0;
  const result = (status: SyncStatus, connectionStatus: SyncResult['connectionStatus'], error: string | null): SyncResult => ({
    status,
    publications: saved,
    connectionStatus,
    error,
    usage: provider.usage(),
    finishedAt: new Date().toISOString(),
  });

  let outcome: SyncResult;
  try {
    let tokens = await store.loadTokens(connection.id);
    const refreshed = await provider.refresh(tokens, now);
    if (refreshed) {
      tokens = refreshed;
      await store.saveTokens(connection.id, tokens);
    }

    const account = await provider.fetchAccount(tokens, connection.externalId);
    await store.updateProfile(connection.id, account);
    if (Object.keys(account.metrics).length) await store.saveAccountMetrics(connection.id, day, account.metrics);

    const posts = await provider.fetchPosts(tokens, connection.externalId, syncWindowStart(connection.lastSyncAt, now));
    for (const post of posts) {
      const publicationId = await store.upsertPublication(connection.userId, { platform: connection.platform, connectionId: connection.id, post });
      if (Object.keys(post.metrics).length) await store.savePostMetrics(publicationId, connection.userId, day, post.metrics);
      saved += 1;
      const usage = provider.usage().percent;
      if (usage !== null && usage >= USAGE_CEILING && saved < posts.length) {
        outcome = result('partial', 'connected', `Uso da cota da API em ${usage}%: o resto fica para a próxima sincronização.`);
        await store.finish(connection.id, outcome);
        return outcome;
      }
    }
    outcome = result('ok', 'connected', null);
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.kind === 'auth') outcome = result('error', 'expired', error.message);
      else if (error.kind === 'rate_limit') outcome = result('rate_limited', 'connected', error.message);
      else outcome = result(saved > 0 ? 'partial' : 'error', error.kind === 'permission' ? 'error' : 'connected', error.message);
    } else {
      console.error('sync failed', connection.platform, error instanceof Error ? error.message.slice(0, 200) : 'unknown');
      outcome = result(saved > 0 ? 'partial' : 'error', 'connected', 'Erro inesperado na sincronização.');
    }
  }
  await store.finish(connection.id, outcome);
  return outcome;
}
