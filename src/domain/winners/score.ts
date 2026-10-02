import { PERFORMANCE_KEYS, WINNER_TYPE_METRICS, WINNER_TYPES, type PerformanceKey, type PerformanceMetrics, type WinnerType } from './record';

/**
 * Content Score: 0–100, relative to the user's own library, never to views alone.
 * Each measured metric is compared to the best value of the library on a log scale
 * (so one viral post doesn't flatten everything else), then averaged with the profile weights.
 * Metrics not measured on a content don't count for or against it.
 */

export type ScoreWeights = Record<PerformanceKey, number>;

export const SCORE_PROFILES = ['equilibrado', 'alcance', 'conversao', 'personalizado'] as const;
export type ScoreProfile = (typeof SCORE_PROFILES)[number];
export const SCORE_PROFILE_LABELS: Record<ScoreProfile, string> = {
  equilibrado: 'Equilibrado',
  alcance: 'Awareness (alcance)',
  conversao: 'Conversão',
  personalizado: 'Personalizado',
};

export const PRESET_WEIGHTS: Record<Exclude<ScoreProfile, 'personalizado'>, ScoreWeights> = {
  equilibrado: { views: 1, likes: 0.5, comments: 0.5, shares: 1, saves: 1, profileVisits: 1, clicks: 1, signups: 1.5, trials: 1.5, sales: 2, revenue: 2 },
  alcance: { views: 3, likes: 1, comments: 1, shares: 2, saves: 1.5, profileVisits: 0.5, clicks: 0.25, signups: 0.25, trials: 0.25, sales: 0.25, revenue: 0.25 },
  conversao: { views: 0.5, likes: 0.25, comments: 0.25, shares: 0.5, saves: 0.5, profileVisits: 1.5, clicks: 2, signups: 3, trials: 3, sales: 3, revenue: 3 },
};

export const MAX_WEIGHT = 5;
/** Below this, the score would say more about one number than about the content. */
export const MIN_SCORED_METRICS = 2;

export function weightsFor(profile: ScoreProfile, custom: ScoreWeights | null): ScoreWeights {
  return profile === 'personalizado' ? (custom ?? PRESET_WEIGHTS.equilibrado) : PRESET_WEIGHTS[profile];
}

export function sanitizeWeights(raw: Partial<Record<string, unknown>> | null | undefined): ScoreWeights {
  const weights = { ...PRESET_WEIGHTS.equilibrado };
  for (const key of PERFORMANCE_KEYS) {
    const value = raw?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) weights[key] = Math.min(MAX_WEIGHT, Math.max(0, value));
  }
  return weights;
}

/** Best value of each metric in the library: the reference for 100. */
export type ScoreReference = Partial<Record<PerformanceKey, number>>;

export function scoreReference(library: PerformanceMetrics[]): ScoreReference {
  const reference: ScoreReference = {};
  for (const metrics of library) {
    for (const key of PERFORMANCE_KEYS) {
      const value = metrics[key];
      if (value !== null && value > (reference[key] ?? 0)) reference[key] = value;
    }
  }
  return reference;
}

export interface ContentScore {
  value: number;
  /** How many metrics went into it. */
  basis: number;
}

export function contentScore(metrics: PerformanceMetrics, reference: ScoreReference, weights: ScoreWeights): ContentScore | null {
  let weighted = 0;
  let totalWeight = 0;
  let basis = 0;
  for (const key of PERFORMANCE_KEYS) {
    const value = metrics[key];
    const best = reference[key];
    const weight = weights[key];
    if (value === null || !best || weight <= 0) continue;
    weighted += weight * (Math.log1p(value) / Math.log1p(best));
    totalWeight += weight;
    basis += 1;
  }
  if (basis < MIN_SCORED_METRICS || totalWeight === 0) return null;
  return { value: Math.round((100 * weighted) / totalWeight), basis };
}

export type ScoreBand = 'excelente' | 'bom' | 'mediano' | 'abaixo';
export const SCORE_BAND_INFO: Record<ScoreBand, { emoji: string; label: string }> = {
  excelente: { emoji: '🔥', label: 'Excelente' },
  bom: { emoji: '✅', label: 'Bom' },
  mediano: { emoji: '➖', label: 'Mediano' },
  abaixo: { emoji: '⚠️', label: 'Abaixo da média' },
};

export function scoreBand(value: number): ScoreBand {
  if (value >= 85) return 'excelente';
  if (value >= 65) return 'bom';
  if (value >= 40) return 'mediano';
  return 'abaixo';
}

const STANDOUT = 1.5;
const MIN_COMPARISON = 3;

function typeValue(metrics: PerformanceMetrics, type: WinnerType): number | null {
  const values = WINNER_TYPE_METRICS[type].map((key) => metrics[key]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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
