import type { SocialService } from '../../application/ports';
import type { SocialConfig, SocialConnection, SyncRun } from '../../domain/social/connection';
import type { AccountSnapshot, PostSnapshot } from '../../domain/social/metrics';

const LOCAL_MESSAGE = 'Conectar contas pelas APIs oficiais precisa do modo com login (Supabase). Neste navegador os dados ficam só aqui e não há servidor para guardar tokens.';

/** Local mode: nothing is connected and nothing pretends to be. */
export class UnavailableSocial implements SocialService {
  readonly available = false;
  config(): Promise<SocialConfig> {
    return Promise.reject(new Error(LOCAL_MESSAGE));
  }
  async listConnections(): Promise<SocialConnection[]> {
    return [];
  }
  startConnection(): Promise<string> {
    return Promise.reject(new Error(LOCAL_MESSAGE));
  }
  disconnect(): Promise<void> {
    return Promise.reject(new Error(LOCAL_MESSAGE));
  }
  sync(): Promise<{ status: SyncRun['status']; publications: number; error: string | null }> {
    return Promise.reject(new Error(LOCAL_MESSAGE));
  }
  updateLinks(): Promise<void> {
    return Promise.reject(new Error(LOCAL_MESSAGE));
  }
  async listRuns(): Promise<SyncRun[]> {
    return [];
  }
  async postSnapshots(): Promise<PostSnapshot[]> {
    return [];
  }
  async accountSnapshots(): Promise<AccountSnapshot[]> {
    return [];
  }
}
