export const METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'follows'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: 'Visualizações',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  follows: 'Seguidores ganhos',
};

export type Metrics = Record<MetricKey, number> & { recordedAt: string };

export const RANKING_GOALS = ['engagement', 'views', 'saves', 'shares', 'follows'] as const;
export type RankingGoal = (typeof RANKING_GOALS)[number];

export const RANKING_GOAL_LABELS: Record<RankingGoal, string> = {
  engagement: 'Taxa de engajamento',
  views: 'Visualizações',
  saves: 'Taxa de salvamento',
  shares: 'Taxa de compartilhamento',
  follows: 'Seguidores por mil views',
};

export function emptyMetrics(): Metrics {
  return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, follows: 0, recordedAt: new Date().toISOString() };
}

export function hasMetrics(metrics: Metrics | null | undefined): metrics is Metrics {
  return Boolean(metrics && metrics.views > 0);
}

const rate = (part: number, views: number) => (views > 0 ? part / views : 0);

/** (likes + comments + shares + saves) / views */
export function engagementRate(metrics: Metrics): number {
  return rate(metrics.likes + metrics.comments + metrics.shares + metrics.saves, metrics.views);
}

export function goalScore(metrics: Metrics, goal: RankingGoal): number {
  switch (goal) {
    case 'engagement':
      return engagementRate(metrics);
    case 'views':
      return metrics.views;
    case 'saves':
      return rate(metrics.saves, metrics.views);
    case 'shares':
      return rate(metrics.shares, metrics.views);
    case 'follows':
      return rate(metrics.follows, metrics.views) * 1000;
  }
}

export function formatScore(value: number, goal: RankingGoal): string {
  if (goal === 'views') return Math.round(value).toLocaleString('pt-BR');
  if (goal === 'follows') return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** Index of the best variant for a goal, or null when fewer than two variants have data. */
export function winnerIndex(variants: (Metrics | null)[], goal: RankingGoal): number | null {
  const scored = variants
    .map((metrics, index) => (hasMetrics(metrics) ? { index, score: goalScore(metrics, goal) } : null))
    .filter((entry): entry is { index: number; score: number } => entry !== null);
  if (scored.length < 2) return null;
  const best = scored.reduce((top, entry) => (entry.score > top.score ? entry : top));
  return scored.filter((entry) => entry.score === best.score).length > 1 ? null : best.index;
}

export interface GroupPerformance<K extends string> {
  key: K;
  samples: number;
  averageScore: number;
}

/** Average score per group (e.g. visual style) across every measured carousel. */
export function performanceBy<K extends string>(items: { key: K; metrics: Metrics | null }[], goal: RankingGoal): GroupPerformance<K>[] {
  const groups = new Map<K, number[]>();
  for (const item of items) {
    if (!hasMetrics(item.metrics)) continue;
    groups.set(item.key, [...(groups.get(item.key) ?? []), goalScore(item.metrics, goal)]);
  }
  return [...groups.entries()]
    .map(([key, scores]) => ({ key, samples: scores.length, averageScore: scores.reduce((sum, value) => sum + value, 0) / scores.length }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

export function sanitizeMetric(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
