import { PERFORMANCE_KEYS, WINNER_TYPE_METRICS, WINNER_TYPES, type PerformanceKey, type PerformanceMetrics, type WinnerType } from './record';

/**
 * Performance Score: 0–100, comparing a content with the other contents of the same account.
 * It reads rates (shares, saves, conversions, follows per view…) more than raw numbers, so a small account
 * is never punished for having a small audience. 50 is the account's usual, 75 is twice it, 100 is 4× or more.
 * Retention is not part of it: the platforms don't give it without their APIs.
 */

export const SCORE_COMPONENTS = ['shareRate', 'saveRate', 'conversionRate', 'followRate', 'engagementRate', 'commentRate', 'clickRate', 'viewsRelative'] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const SCORE_COMPONENT_LABELS: Record<ScoreComponent, string> = {
  shareRate: 'Taxa de compartilhamento',
  saveRate: 'Taxa de salvamento',
  conversionRate: 'Taxa de conversão',
  followRate: 'Taxa de seguidores',
  engagementRate: 'Taxa de engajamento',
  commentRate: 'Taxa de comentários',
  clickRate: 'Taxa de cliques',
  viewsRelative: 'Visualizações vs média da conta',
};

export type ScoreWeights = Record<ScoreComponent, number>;

export const SCORE_PROFILES = ['equilibrado', 'alcance', 'conversao', 'personalizado'] as const;
export type ScoreProfile = (typeof SCORE_PROFILES)[number];
export const SCORE_PROFILE_LABELS: Record<ScoreProfile, string> = {
  equilibrado: 'Equilibrado',
  alcance: 'Awareness (alcance)',
  conversao: 'Conversão',
  personalizado: 'Personalizado',
};

/** Equilibrado follows the priority: shares, saves, conversions, followers, engagement. */
export const PRESET_WEIGHTS: Record<Exclude<ScoreProfile, 'personalizado'>, ScoreWeights> = {
  equilibrado: { shareRate: 3, saveRate: 3, conversionRate: 2.5, followRate: 2, engagementRate: 1.5, commentRate: 1, clickRate: 1, viewsRelative: 1 },
  alcance: { shareRate: 3, saveRate: 2, conversionRate: 0.5, followRate: 1.5, engagementRate: 1.5, commentRate: 1, clickRate: 0.5, viewsRelative: 3 },
  conversao: { shareRate: 1.5, saveRate: 1.5, conversionRate: 3, followRate: 2, engagementRate: 1, commentRate: 0.5, clickRate: 3, viewsRelative: 0.5 },
};

export const MAX_WEIGHT = 5;
/** An account needs this many measured contents to be its own reference; before that, every account is. */
export const MIN_ACCOUNT_SAMPLES = 3;

export function weightsFor(profile: ScoreProfile, custom: ScoreWeights | null): ScoreWeights {
  return profile === 'personalizado' ? (custom ?? PRESET_WEIGHTS.equilibrado) : PRESET_WEIGHTS[profile];
}

export function sanitizeWeights(raw: Partial<Record<string, unknown>> | null | undefined): ScoreWeights {
  const weights = { ...PRESET_WEIGHTS.equilibrado };
  for (const key of SCORE_COMPONENTS) {
    const value = raw?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) weights[key] = Math.min(MAX_WEIGHT, Math.max(0, value));
  }
  return weights;
}

const perView = (value: number | null, views: number) => (value === null ? null : value / views);

/** Sign-ups when measured, otherwise sales, otherwise leads, over the link clicks. */
function conversionsPerClick(metrics: PerformanceMetrics): number | null {
  const converted = metrics.signups ?? metrics.sales ?? metrics.leads;
  return converted !== null && metrics.clicks ? converted / metrics.clicks : null;
}

/** The value of each component for one content; null when it was not measured. */
export function componentValue(metrics: PerformanceMetrics, component: ScoreComponent): number | null {
  const views = metrics.views;
  if (!views) return null;
  switch (component) {
    case 'viewsRelative':
      return views;
    case 'shareRate':
      return perView(metrics.shares, views);
    case 'saveRate':
      return perView(metrics.saves, views);
    case 'commentRate':
      return perView(metrics.comments, views);
    case 'followRate':
      return perView(metrics.follows, views);
    case 'clickRate':
      return perView(metrics.clicks, views);
    case 'conversionRate':
      return conversionsPerClick(metrics);
    case 'engagementRate': {
      const parts = [metrics.likes, metrics.comments, metrics.shares, metrics.saves];
      if (parts.every((part) => part === null)) return null;
      return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0) / views;
    }
  }
}

/** What is usual for an account: the median of each component (the mean when the median is zero). */
export type ScoreBaseline = Partial<Record<ScoreComponent, number>>;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function baselineOf(library: PerformanceMetrics[]): ScoreBaseline {
  const baseline: ScoreBaseline = {};
  for (const component of SCORE_COMPONENTS) {
    const values = library.map((metrics) => componentValue(metrics, component)).filter((value): value is number => value !== null);
    if (values.length === 0) continue;
    const typical = median(values) || values.reduce((sum, value) => sum + value, 0) / values.length;
    if (typical > 0) baseline[component] = typical;
  }
  return baseline;
}

export interface ScoreBaselines {
  byAccount: Map<string, ScoreBaseline>;
  global: ScoreBaseline;
}

/** One reference per account with enough measured contents; the others use the whole library. */
export function buildBaselines(items: { account: string | null; metrics: PerformanceMetrics }[]): ScoreBaselines {
  const measured = items.filter((item) => item.metrics.views);
  const groups = new Map<string, PerformanceMetrics[]>();
  for (const item of measured) if (item.account) groups.set(item.account, [...(groups.get(item.account) ?? []), item.metrics]);
  const byAccount = new Map<string, ScoreBaseline>();
  for (const [account, list] of groups) if (list.length >= MIN_ACCOUNT_SAMPLES) byAccount.set(account, baselineOf(list));
  return { byAccount, global: baselineOf(measured.map((item) => item.metrics)) };
}

export function baselineFor(baselines: ScoreBaselines, account: string | null): ScoreBaseline {
  return (account && baselines.byAccount.get(account)) || baselines.global;
}

export interface ContentScore {
  value: number;
  /** How many components went into it. */
  basis: number;
}

/** Needs the views plus at least one rate: views alone never make a score. */
const MIN_COMPONENTS = 2;

export function performanceScore(metrics: PerformanceMetrics, baseline: ScoreBaseline, weights: ScoreWeights): ContentScore | null {
  let weighted = 0;
  let totalWeight = 0;
  let basis = 0;
  for (const component of SCORE_COMPONENTS) {
    const value = componentValue(metrics, component);
    const typical = baseline[component];
    const weight = weights[component];
    if (value === null || !typical || weight <= 0) continue;
    const ratio = value / typical;
    const points = ratio <= 0 ? 0 : Math.min(100, Math.max(0, 50 + 25 * Math.log2(ratio)));
    weighted += weight * points;
    totalWeight += weight;
    basis += 1;
  }
  if (basis < MIN_COMPONENTS || totalWeight === 0) return null;
  return { value: Math.round(weighted / totalWeight), basis };
}

export type ScoreBand = 'excelente' | 'bom' | 'mediano' | 'abaixo';
export const SCORE_BAND_INFO: Record<ScoreBand, { emoji: string; label: string }> = {
  excelente: { emoji: '🔥', label: 'Excelente' },
  bom: { emoji: '✅', label: 'Acima da média' },
  mediano: { emoji: '➖', label: 'Na média' },
  abaixo: { emoji: '⚠️', label: 'Abaixo da média' },
};

export function scoreBand(value: number): ScoreBand {
  if (value >= 80) return 'excelente';
  if (value >= 60) return 'bom';
  if (value >= 40) return 'mediano';
  return 'abaixo';
}

const STANDOUT = 1.5;
const MIN_COMPARISON = 3;

function typeValue(metrics: PerformanceMetrics, type: WinnerType): number | null {
  const values = WINNER_TYPE_METRICS[type].map((key) => metrics[key]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Winner types the numbers support. Any sale or sign-up qualifies the business types;
 * attention types need to stand out (1.5× the median) against at least 3 other measured contents.
 */
export function suggestWinnerTypes(metrics: PerformanceMetrics, others: PerformanceMetrics[]): WinnerType[] {
  return WINNER_TYPES.filter((type) => {
    const value = typeValue(metrics, type);
    if (value === null || value <= 0) return false;
    if (type === 'aquisicao' || type === 'conversao') return true;
    const comparison = others.map((item) => typeValue(item, type)).filter((item): item is number => item !== null);
    if (comparison.length < MIN_COMPARISON) return false;
    return value >= STANDOUT * median(comparison);
  });
}

/** Keys that measure attention, to show beside the score. */
export const ATTENTION_KEYS: PerformanceKey[] = PERFORMANCE_KEYS.filter((key) => ['views', 'likes', 'comments', 'shares', 'saves', 'follows'].includes(key));
