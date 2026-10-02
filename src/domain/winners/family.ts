import type { Carousel } from '../carousel';
import { hasMetrics, type Metrics } from '../metrics';
import { metricValue, type AnalysisMetric, type ScoreOf } from './insights';
import { accountKey, emptyPerformance, hasAnyMetric, type ContentRecord, type PerformanceMetrics } from './record';

/** A content created from a winner: as a model, a variation or part of a family. */
export interface FamilyMember {
  carousel: Carousel;
  /** Results registered for it, when there are any. */
  record: ContentRecord | null;
  metrics: PerformanceMetrics | null;
}

/** The quick numbers typed in Testes become performance metrics (the funnel ones stay unmeasured). */
export function carouselPerformance(metrics: Metrics | null): PerformanceMetrics | null {
  if (!hasMetrics(metrics)) return null;
  return { ...emptyPerformance(), views: metrics.views, likes: metrics.likes, comments: metrics.comments, shares: metrics.shares, saves: metrics.saves, follows: metrics.follows || null };
}

export function familyMembers(modelId: string, carousels: Carousel[], records: ContentRecord[]): FamilyMember[] {
  return carousels
    .filter((carousel) => carousel.origin?.modelId === modelId)
    .map((carousel) => {
      const record = records.find((item) => item.carouselId === carousel.id) ?? null;
      const metrics = record && hasAnyMetric(record.metrics) ? record.metrics : carouselPerformance(carousel.metrics);
      return { carousel, record, metrics };
    })
    .sort((a, b) => a.carousel.createdAt.localeCompare(b.carousel.createdAt));
}

/** Family names in creation order, "" for loose variations and models. */
export function familyNames(members: FamilyMember[]): string[] {
  return [...new Set(members.map((member) => member.carousel.origin?.family ?? ''))];
}

export interface StructureStat {
  model: ContentRecord;
  members: number;
  measured: number;
  /** Average of the measured members; null while none was measured. */
  average: number | null;
  modelValue: number | null;
  best: FamilyMember | null;
}

/**
 * How each winning structure keeps performing in the contents created from it.
 * Only models with at least one derived content appear; the most proven first.
 */
export function structureStats(models: ContentRecord[], carousels: Carousel[], records: ContentRecord[], metric: AnalysisMetric, scoreOf: ScoreOf): StructureStat[] {
  return models
    .map((model) => {
      const members = familyMembers(model.id, carousels, records);
      const measured = members
        .map((member) => ({ member, value: member.metrics ? metricValue(member.metrics, metric, scoreOf, member.carousel.source.accountId ? `id:${member.carousel.source.accountId}` : null) : null }))
        .filter((entry): entry is { member: FamilyMember; value: number } => entry.value !== null);
      const best = measured.reduce<{ member: FamilyMember; value: number } | null>((top, entry) => (!top || entry.value > top.value ? entry : top), null);
      return {
        model,
        members: members.length,
        measured: measured.length,
        average: measured.length ? measured.reduce((sum, entry) => sum + entry.value, 0) / measured.length : null,
        modelValue: metricValue(model.metrics, metric, scoreOf, accountKey(model)),
        best: best?.member ?? null,
      };
    })
    .filter((stat) => stat.members > 0)
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || b.measured - a.measured);
}
