import { hasAnyMetric, PERFORMANCE_KEYS, type ContentRecord, type MetricSnapshot, type PerformanceKey, type PerformanceMetrics } from '../winners/record';

/**
 * How a post keeps moving after it is published, from the numbers typed on different days.
 * The day it was posted counts as zero, so even one measurement already says how fast it grew.
 */

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Measurements of a record; content measured before the history existed counts as one measurement. */
export function historyOf(record: Pick<ContentRecord, 'metrics' | 'metricsHistory' | 'metricsUpdatedAt' | 'publishedAt'>): MetricSnapshot[] {
  if (record.metricsHistory.length) return record.metricsHistory;
  const day = record.metricsUpdatedAt?.slice(0, 10) ?? record.publishedAt;
  return hasAnyMetric(record.metrics) && day ? [{ day, metrics: record.metrics }] : [];
}

interface Point {
  day: string;
  metrics: PerformanceMetrics;
  /** The publication day, with every number at zero. */
  zero: boolean;
}

function pointsOf(record: ContentRecord): Point[] {
  const history = historyOf(record).map((snapshot) => ({ ...snapshot, zero: false }));
  const published = record.publishedAt;
  if (!published || !history.length || history[0].day < published) return history;
  const zero = Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, 0])) as PerformanceMetrics;
  return history[0].day === published ? history : [{ day: published, metrics: zero, zero: true }, ...history];
}

const gain = (to: number | null, from: number | null): number | null => (to === null || from === null ? null : to - from);

export interface MeasurementStep {
  day: string;
  /** Days since publication, when the publication day is known. */
  ageDays: number | null;
  metrics: PerformanceMetrics;
  /** Growth since the measurement before (or since posting); null on the very first one without a posting day. */
  delta: Record<PerformanceKey, number | null>;
  viewsPerDay: number | null;
}

export function measurementSteps(record: ContentRecord): MeasurementStep[] {
  const points = pointsOf(record);
  return points.flatMap((point, index) => {
    if (point.zero) return [];
    const previous = points[index - 1];
    const delta = Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, previous ? gain(point.metrics[key], previous.metrics[key]) : null])) as Record<PerformanceKey, number | null>;
    const days = previous ? Math.max(1, daysBetween(previous.day, point.day)) : null;
    return [
      {
        day: point.day,
        ageDays: record.publishedAt ? daysBetween(record.publishedAt, point.day) : null,
        metrics: point.metrics,
        delta,
        viewsPerDay: days && delta.views !== null ? delta.views / days : null,
      },
    ];
  });
}

export const MOMENTUMS = ['growing', 'slowing', 'stable', 'early'] as const;
export type Momentum = (typeof MOMENTUMS)[number];
export const MOMENTUM_INFO: Record<Momentum, { label: string; detail: string }> = {
  growing: { label: 'Ainda crescendo', detail: 'Ganhou views no último intervalo no mesmo ritmo de antes, ou mais rápido.' },
  slowing: { label: 'Desacelerando', detail: 'Ainda ganha views, mas bem mais devagar que no começo.' },
  stable: { label: 'Estabilizou', detail: 'Quase não ganhou views desde a medição anterior.' },
  early: { label: 'Meça de novo', detail: 'Com mais uma medição dá pra saber se ainda está crescendo.' },
};

/** Below this share of new views over the total, the post has stopped moving. */
const STABLE_GAIN = 0.02;
/** The last stretch keeps at least this share of the earlier pace to count as still growing. */
const GROWING_PACE = 0.6;

/** Whether the post is still gaining views, from the last stretch against the pace before it. */
export function momentumOf(record: ContentRecord): Momentum | null {
  const points = pointsOf(record).filter((point) => point.metrics.views !== null);
  if (!points.some((point) => !point.zero)) return null;
  if (points.length < 3) return 'early';
  const [first, before, last] = [points[0], points[points.length - 2], points[points.length - 1]];
  const lastGain = (last.metrics.views ?? 0) - (before.metrics.views ?? 0);
  if (lastGain <= (before.metrics.views ?? 0) * STABLE_GAIN) return 'stable';
  const lastPace = lastGain / Math.max(1, daysBetween(before.day, last.day));
  const earlierPace = ((before.metrics.views ?? 0) - (first.metrics.views ?? 0)) / Math.max(1, daysBetween(first.day, before.day));
  return lastPace >= earlierPace * GROWING_PACE ? 'growing' : 'slowing';
}
