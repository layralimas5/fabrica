import { isPosted } from '../carousel';
import { periodRange, type Period } from '../winners/filters';
import type { ScoreOf } from '../winners/insights';
import { accountKey, recordDay, type ContentFormat, type ContentPlatform, type PerformanceKey } from '../winners/record';
import { componentValue } from '../winners/score';
import { isMeasured, type AnalyticsItem } from './items';

export const CONTENT_KINDS = ['all', 'carrossel', 'ugc', 'video', 'outros'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_KIND_LABELS: Record<ContentKind, string> = { all: 'Todos', carrossel: 'Carrossel', ugc: 'UGC', video: 'Vídeo', outros: 'Outros' };

const KIND_OF_FORMAT: Record<ContentFormat, Exclude<ContentKind, 'all'>> = {
  carrossel: 'carrossel',
  ugc: 'ugc',
  pov: 'video',
  video_narrado: 'video',
  screen_recording: 'video',
  tutorial: 'video',
  storytelling: 'video',
  opiniao: 'video',
  demonstracao: 'video',
  outros: 'outros',
};

export const ANALYTICS_PERIODS = ['7', '30', '90', 'custom', 'all'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const ANALYTICS_PERIOD_LABELS: Record<AnalyticsPeriod, string> = { '7': '7 dias', '30': '30 dias', '90': '90 dias', custom: 'Personalizado', all: 'Tudo' };

export interface AnalyticsFilters {
  /** Null = every account. */
  accountId: string | null;
  platform: ContentPlatform | 'all';
  period: AnalyticsPeriod;
  from: string;
  to: string;
  kind: ContentKind;
}

/** Posted carousels and contents registered from outside: what the numbers are about. */
export function isPublished(item: AnalyticsItem): boolean {
  return item.carousel ? isPosted(item.carousel) || isMeasured(item) : true;
}

export function applyAnalyticsFilters(items: AnalyticsItem[], filters: AnalyticsFilters, today: string, ignoreAccount = false): AnalyticsItem[] {
  const { from, to } = periodRange({ period: filters.period as Period, from: filters.from, to: filters.to }, today);
  return items.filter(({ record }) => {
    if (!ignoreAccount && filters.accountId && record.accountId !== filters.accountId) return false;
    if (filters.platform !== 'all' && record.platform !== filters.platform) return false;
    if (filters.kind !== 'all' && KIND_OF_FORMAT[record.format] !== filters.kind) return false;
    const day = recordDay(record);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

export interface Kpi {
  key: PerformanceKey;
  total: number;
  /** How many contents measured it. */
  measured: number;
}

/** Totals of what was typed; a metric nobody measured stays out instead of showing zero. */
export function kpis(items: AnalyticsItem[], keys: PerformanceKey[]): Kpi[] {
  return keys.map((key) => {
    const values = items.map((item) => item.record.metrics[key]).filter((value): value is number => value !== null);
    return { key, total: values.reduce((sum, value) => sum + value, 0), measured: values.length };
  });
}

/** Pooled rate of a group (sum over sum), steadier than averaging each content's rate. */
export function pooledRate(items: AnalyticsItem[], part: PerformanceKey): number | null {
  const measured = items.filter((item) => item.record.metrics[part] !== null && item.record.metrics.views);
  if (measured.length === 0) return null;
  const views = measured.reduce((sum, item) => sum + (item.record.metrics.views ?? 0), 0);
  return views ? measured.reduce((sum, item) => sum + (item.record.metrics[part] ?? 0), 0) / views : null;
}

export interface Scored {
  item: AnalyticsItem;
  score: number;
}

export function scoredItems(items: AnalyticsItem[], scoreOf: ScoreOf): Scored[] {
  return items
    .filter(isMeasured)
    .map((item) => ({ item, score: scoreOf(item.record.metrics, accountKey(item.record)) }))
    .filter((entry): entry is Scored => entry.score !== null)
    .sort((a, b) => b.score - a.score || (b.item.record.metrics.views ?? 0) - (a.item.record.metrics.views ?? 0));
}

export interface TemplateStat {
  template: string;
  uses: number;
  measured: number;
  averageViews: number | null;
  saveRate: number | null;
  shareRate: number | null;
  averageScore: number | null;
  best: AnalyticsItem | null;
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Every slide model used, how often and how it performed. Best average score first. */
export function templateStats(items: AnalyticsItem[], scoreOf: ScoreOf): TemplateStat[] {
  const groups = new Map<string, AnalyticsItem[]>();
  for (const item of items) {
    const template = item.record.visualStyle;
    if (template && item.record.format === 'carrossel') groups.set(template, [...(groups.get(template) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([template, list]) => {
      const scored = scoredItems(list, scoreOf);
      const measured = list.filter(isMeasured);
      return {
        template,
        uses: list.length,
        measured: measured.length,
        averageViews: mean(measured.map((item) => item.record.metrics.views ?? 0)),
        saveRate: mean(measured.map((item) => componentValue(item.record.metrics, 'saveRate')).filter((value): value is number => value !== null)),
        shareRate: mean(measured.map((item) => componentValue(item.record.metrics, 'shareRate')).filter((value): value is number => value !== null)),
        averageScore: mean(scored.map((entry) => entry.score)),
        best: scored[0]?.item ?? null,
      };
    })
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || b.uses - a.uses);
}

export interface AccountStat {
  account: string;
  posts: number;
  measured: number;
  views: number;
  viewsPerPost: number | null;
  shareRate: number | null;
  saveRate: number | null;
  followRate: number | null;
  averageScore: number | null;
  best: AnalyticsItem | null;
}

/**
 * Accounts side by side. Proportional rates are what can be compared across audiences;
 * the score average is shown too but each account is scored against itself.
 */
export function accountStats(items: AnalyticsItem[], scoreOf: ScoreOf): AccountStat[] {
  const groups = new Map<string, AnalyticsItem[]>();
  for (const item of items) {
    const key = accountKey(item.record);
    if (key) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([account, list]) => {
      const measured = list.filter(isMeasured);
      const scored = scoredItems(list, scoreOf);
      const views = measured.reduce((sum, item) => sum + (item.record.metrics.views ?? 0), 0);
      return {
        account,
        posts: list.filter(isPublished).length,
        measured: measured.length,
        views,
        viewsPerPost: measured.length ? views / measured.length : null,
        shareRate: pooledRate(measured, 'shares'),
        saveRate: pooledRate(measured, 'saves'),
        followRate: pooledRate(measured, 'follows'),
        averageScore: mean(scored.map((entry) => entry.score)),
        best: scored[0]?.item ?? null,
      };
    })
    .sort((a, b) => b.views - a.views);
}

/** Best content of the last 7 days (by publication day), or null when nothing was measured in them. */
export function weeklyChampion(items: AnalyticsItem[], scoreOf: ScoreOf, today: string): Scored | null {
  const week = applyAnalyticsFilters(items, { accountId: null, platform: 'all', period: '7', from: '', to: '', kind: 'all' }, today);
  return scoredItems(week, scoreOf)[0] ?? null;
}
