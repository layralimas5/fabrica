import { addDays } from '../schedule';
import { emptyPerformance, hasAnyMetric, PERFORMANCE_KEYS, type ContentRecord, type MetricSnapshot, type PerformanceKey, type PerformanceMetrics } from '../winners/record';
import type { AnalyticsItem } from './items';

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

export interface GrowthEntry {
  item: AnalyticsItem;
  from: string;
  to: string;
  days: number;
  gained: Record<PerformanceKey, number | null>;
  viewsPerDay: number;
  momentum: Momentum | null;
}

/**
 * Who gained the most views in the last `windowDays`: from the last measurement before the window
 * (or the posting day) to the latest one. Only posts measured inside the window take part.
 */
export function growthRanking(items: AnalyticsItem[], today: string, windowDays = 7): GrowthEntry[] {
  const start = addDays(today, -windowDays);
  const entries: GrowthEntry[] = [];
  for (const item of items) {
    const points = pointsOf(item.record).filter((point) => point.metrics.views !== null);
    const latest = points[points.length - 1];
    if (!latest || latest.zero || latest.day < start) continue;
    const baseline = [...points].reverse().find((point) => point.day <= start) ?? points[0];
    if (baseline === latest) continue;
    const gained = Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, gain(latest.metrics[key], baseline.metrics[key])])) as Record<PerformanceKey, number | null>;
    const days = Math.max(1, daysBetween(baseline.day, latest.day));
    entries.push({ item, from: baseline.day, to: latest.day, days, gained, viewsPerDay: (gained.views ?? 0) / days, momentum: momentumOf(item.record) });
  }
  return entries.sort((a, b) => (b.gained.views ?? 0) - (a.gained.views ?? 0));
}

export const AGE_MARKS = [1, 3, 7, 14, 30] as const;
export type AgeMark = (typeof AGE_MARKS)[number];

/**
 * The numbers a post had when it was `ageDays` old: exact when measured that day, otherwise read on the line
 * between the measurements around it. Null when it was never measured that late, since guessing ahead would be unfair.
 */
export function metricsAtAge(record: ContentRecord, ageDays: number): { metrics: PerformanceMetrics; estimated: boolean } | null {
  if (!record.publishedAt) return null;
  const target = addDays(record.publishedAt, ageDays);
  const points = pointsOf(record);
  const exact = points.find((point) => point.day === target && !point.zero);
  if (exact) return { metrics: exact.metrics, estimated: false };
  const afterIndex = points.findIndex((point) => point.day > target);
  if (afterIndex <= 0) return null;
  const [before, after] = [points[afterIndex - 1], points[afterIndex]];
  const share = daysBetween(before.day, target) / daysBetween(before.day, after.day);
  const metrics = emptyPerformance();
  for (const key of PERFORMANCE_KEYS) {
    const [from, to] = [before.metrics[key], after.metrics[key]];
    metrics[key] = from === null || to === null ? null : Math.round(from + (to - from) * share);
  }
  return { metrics, estimated: true };
}

export interface AgeEntry {
  item: AnalyticsItem;
  metrics: PerformanceMetrics;
  estimated: boolean;
}

/** Every post at the same age, so a post from yesterday is not compared with one from last month. */
export function ageRanking(items: AnalyticsItem[], ageDays: number): AgeEntry[] {
  return items
    .flatMap((item) => {
      const atAge = metricsAtAge(item.record, ageDays);
      return atAge?.metrics.views ? [{ item, ...atAge }] : [];
    })
    .sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0));
}
