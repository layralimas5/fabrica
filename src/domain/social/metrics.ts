import type { SocialPlatform } from './publication';

/**
 * Metrics read from the networks. Keep the keys in sync with supabase/functions/_shared/social/types.ts.
 * A key missing from a snapshot means the network did not give it, which is different from zero.
 */
export const POST_METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'] as const;
export type PostMetricKey = (typeof POST_METRIC_KEYS)[number];
export type PostMetrics = Partial<Record<PostMetricKey, number>>;

export const ACCOUNT_METRIC_KEYS = ['followers', 'reach', 'views', 'posts'] as const;
export type AccountMetricKey = (typeof ACCOUNT_METRIC_KEYS)[number];
export type AccountMetrics = Partial<Record<AccountMetricKey, number>>;

export interface PostSnapshot {
  publicationId: string;
  /** 'YYYY-MM-DD' (São Paulo) of the reading. */
  day: string;
  metrics: PostMetrics;
  capturedAt: string;
}

export interface AccountSnapshot {
  connectionId: string;
  day: string;
  metrics: AccountMetrics;
  capturedAt: string;
}

export const POST_METRIC_LABELS: Record<PostMetricKey, string> = {
  views: 'Visualizações',
  reach: 'Alcance',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
};

/**
 * What each number means on each network, so views, reach and impressions are never read as the same thing.
 * Null = the network does not give this metric through its official API.
 */
export const METRIC_MEANING: Record<PostMetricKey, Record<SocialPlatform, string | null>> = {
  views: {
    instagram: 'Vezes que o post foi exibido ou reproduzido ("views" da Meta, que substituiu impressões e plays). Conta repetições da mesma pessoa.',
    facebook: 'Vezes que o post foi exibido (post_media_view; em contas antigas, impressões). Conta repetições.',
    tiktok: 'Reproduções do vídeo (view_count). Conta repetições.',
    youtube: 'Visualizações públicas do vídeo (viewCount da Data API), com o filtro de qualidade do YouTube.',
  },
  reach: {
    instagram: 'Contas únicas que viram o post pelo menos uma vez (estimativa da Meta).',
    facebook: 'Pessoas únicas que viram o post (estimativa da Meta).',
    tiktok: null,
    youtube: null,
  },
  likes: { instagram: 'Curtidas.', facebook: 'Reações (todas as reações contam).', tiktok: 'Curtidas.', youtube: 'Gostei (some quando o canal esconde).' },
  comments: { instagram: 'Comentários.', facebook: 'Comentários.', tiktok: 'Comentários.', youtube: 'Comentários.' },
  shares: { instagram: 'Compartilhamentos.', facebook: 'Compartilhamentos.', tiktok: 'Compartilhamentos.', youtube: null },
  saves: { instagram: 'Salvamentos.', facebook: null, tiktok: null, youtube: null },
};

export function sanitizeMetrics<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const clean: Partial<Record<K, number>> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const key of keys) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) clean[key] = Math.floor(value);
  }
  return clean;
}
