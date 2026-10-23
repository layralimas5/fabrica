import { SOCIAL_PLATFORMS, type SocialPlatform } from './publication';

/** An account of ours authorized through the network's official login. Tokens never leave the server. */
export interface SocialConnection {
  id: string;
  platform: SocialPlatform;
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accountId: string | null;
  projectId: string | null;
  scopes: string[];
  status: ConnectionStatus;
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  rateLimit: { percent: number | null; limited: boolean; checkedAt: string } | null;
  createdAt: string;
}

export const CONNECTION_STATUSES = ['connected', 'expired', 'revoked', 'error'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export const CONNECTION_STATUS_INFO: Record<ConnectionStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  connected: { label: 'Conectada', tone: 'success' },
  expired: { label: 'Expirada: reconectar', tone: 'warning' },
  revoked: { label: 'Revogada', tone: 'neutral' },
  error: { label: 'Com erro', tone: 'warning' },
};

export interface PlatformSetup {
  configured: boolean;
  missing: string[];
  scopes: string[];
}

/** What the server says about each network: secrets set or still missing (names only), and the callback to register. */
export interface SocialConfig {
  instagram: PlatformSetup;
  facebook: PlatformSetup;
  tiktok: PlatformSetup;
  youtube: PlatformSetup;
  tokenKey: boolean;
  redirectUris: Record<SocialPlatform, string>;
}

export interface SyncRun {
  id: number;
  connectionId: string;
  trigger: 'manual' | 'schedule';
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'partial' | 'error' | 'rate_limited';
  publications: number;
  error: string | null;
}

export const SYNC_STATUS_LABELS: Record<SyncRun['status'], string> = {
  running: 'Rodando',
  ok: 'Concluída',
  partial: 'Parcial',
  error: 'Falhou',
  rate_limited: 'Limite da API',
};

/** What each integration can and cannot do, said up front so nobody expects a number the API does not give. */
export const PLATFORM_SETUP_INFO: Record<SocialPlatform, { title: string; reads: string; requires: string; docs: string }> = {
  instagram: {
    title: 'Instagram (API com Login do Instagram)',
    reads: 'Perfil, seguidores, posts, carrosséis e reels com visualizações, alcance, curtidas, comentários, compartilhamentos e salvamentos.',
    requires: 'Conta profissional (empresa ou criador) e app da Meta com o produto Instagram. Fora do modo de desenvolvimento, as permissões passam pela revisão da Meta.',
    docs: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
  },
  facebook: {
    title: 'Páginas do Facebook (Graph API)',
    reads: 'Páginas que você administra: seguidores, posts, reações, comentários, compartilhamentos e as visualizações/alcance que a Meta liberar para a página.',
    requires: 'App da Meta com Login do Facebook e as permissões pages_show_list, pages_read_engagement, read_insights e pages_manage_posts.',
    docs: 'https://developers.facebook.com/docs/pages-api',
  },
  tiktok: {
    title: 'TikTok (Display API)',
    reads: 'Perfil, seguidores e vídeos com visualizações, curtidas, comentários e compartilhamentos. A Display API não informa alcance nem salvamentos.',
    requires: 'App no TikTok for Developers com Login Kit, Display API e Content Posting API, com os escopos user.info.basic, user.info.profile, user.info.stats, video.list e video.upload (rascunhos agendados) aprovados. Em sandbox, só contas de teste conectam.',
    docs: 'https://developers.tiktok.com/doc/display-api-overview',
  },
  youtube: {
    title: 'YouTube (Data API v3)',
    reads: 'Canal, inscritos e vídeos (longos e Shorts) com visualizações, gostei e comentários. A Data API não informa alcance, compartilhamentos nem salvamentos.',
    requires: 'Projeto no Google Cloud com a YouTube Data API v3 ativa e cliente OAuth do tipo "Aplicativo da Web". Enquanto o app estiver em teste, só os usuários de teste conectam e a autorização vence em 7 dias; vídeos enviados pela API ficam privados até o Google auditar o projeto.',
    docs: 'https://developers.google.com/youtube/v3/getting-started',
  },
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Days until the authorization ends. TikTok access tokens are refreshed on every sync, so what matters there is
 * the refresh token; Instagram renews its 60-day token on sync; Facebook page tokens do not expire; YouTube
 * renews its 1-hour token from a refresh token whose end Google does not tell (null).
 */
export function daysUntilExpiry(connection: Pick<SocialConnection, 'platform' | 'tokenExpiresAt' | 'refreshExpiresAt'>, now: Date): number | null {
  const end = connection.platform === 'tiktok' || connection.platform === 'youtube' ? connection.refreshExpiresAt : connection.tokenExpiresAt;
  if (!end) return null;
  return Math.floor((new Date(end).getTime() - now.getTime()) / DAY);
}

/** Close to the end and not renewable by itself: shown as a warning with "Reconectar". */
export function expiresSoon(connection: Pick<SocialConnection, 'platform' | 'tokenExpiresAt' | 'refreshExpiresAt' | 'status'>, now: Date): boolean {
  if (connection.status !== 'connected') return false;
  const days = daysUntilExpiry(connection, now);
  return days !== null && days <= 7;
}

export function needsReconnect(connection: Pick<SocialConnection, 'status'>): boolean {
  return connection.status === 'expired' || connection.status === 'revoked';
}

/** "há 5 min", "há 3 h", "há 2 dias", or "nunca". */
export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return 'nunca';
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Return of the OAuth callback (?conexao=ok|erro&rede=...&contas=...&motivo=...), read once on the screen. */
export interface ConnectionNotice {
  ok: boolean;
  platform: SocialPlatform | null;
  count: number;
  reason: string | null;
}

export function readConnectionNotice(search: string): ConnectionNotice | null {
  const params = new URLSearchParams(search);
  const result = params.get('conexao');
  if (result !== 'ok' && result !== 'erro') return null;
  const platform = params.get('rede');
  return {
    ok: result === 'ok',
    platform: SOCIAL_PLATFORMS.includes(platform as SocialPlatform) ? (platform as SocialPlatform) : null,
    count: Math.max(0, Number(params.get('contas') ?? 0) || 0),
    reason: params.get('motivo')?.slice(0, 200) ?? null,
  };
}
