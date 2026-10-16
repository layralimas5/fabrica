import { VISUAL_STYLE_LABELS } from '../brandKit';
import { CONTENT_TYPE_LABELS, OBJECTIVE_LABELS } from '../content';
import { PRODUCT_PLACEMENT_LABELS } from './dna';
import {
  accountKey,
  CONTENT_FORMAT_LABELS,
  formatMetric,
  formatPercent,
  HOOK_TYPE_LABELS,
  PERFORMANCE_LABELS,
  PILLAR_LABELS,
  type ContentRecord,
  type PerformanceKey,
  type PerformanceMetrics,
} from './record';
import { componentValue } from './score';

/** Rates computed from the typed numbers, always shown as a percentage. */
export const RATE_METRICS = ['engagementRate', 'shareRate', 'saveRate', 'commentRate', 'followRate', 'clickRate', 'conversionRate'] as const;
export type RateMetric = (typeof RATE_METRICS)[number];

export const RATE_LABELS: Record<RateMetric, string> = {
  engagementRate: 'Engagement Rate',
  shareRate: 'Share Rate',
  saveRate: 'Save Rate',
  commentRate: 'Comment Rate',
  followRate: 'Follow Rate',
  clickRate: 'Click Rate',
  conversionRate: 'Conversion Rate',
};

/** What a group is compared by. */
export type AnalysisMetric = PerformanceKey | RateMetric | 'score';

export const ANALYSIS_METRIC_GROUPS: { label: string; options: AnalysisMetric[] }[] = [
  { label: 'Geral', options: ['score'] },
  { label: 'Taxas', options: ['shareRate', 'saveRate', 'engagementRate', 'followRate', 'commentRate', 'clickRate', 'conversionRate'] },
  { label: 'Atenção', options: ['views', 'likes', 'comments', 'shares', 'saves', 'follows'] },
  { label: 'Interesse', options: ['profileVisits', 'clicks'] },
  { label: 'Conversão', options: ['leads', 'signups', 'trials', 'sales', 'revenue'] },
];

const isRate = (metric: AnalysisMetric): metric is RateMetric => (RATE_METRICS as readonly string[]).includes(metric);

export function analysisMetricLabel(metric: AnalysisMetric): string {
  if (metric === 'score') return 'Performance Score';
  if (isRate(metric)) return RATE_LABELS[metric];
  return PERFORMANCE_LABELS[metric];
}

export function formatAnalysisValue(metric: AnalysisMetric, value: number): string {
  if (metric === 'score') return String(Math.round(value));
  if (isRate(metric)) return formatPercent(value);
  return formatMetric(metric, Math.round(value));
}

/** Performance Score of some numbers, inside the account they belong to. */
export type ScoreOf = (metrics: PerformanceMetrics, account: string | null) => number | null;

export function rateValue(metrics: PerformanceMetrics, metric: RateMetric): number | null {
  return componentValue(metrics, metric);
}

export function metricValue(metrics: PerformanceMetrics, metric: AnalysisMetric, scoreOf: ScoreOf, account: string | null = null): number | null {
  if (metric === 'score') return scoreOf(metrics, account);
  if (isRate(metric)) return rateValue(metrics, metric);
  return metrics[metric];
}

export interface Grouping {
  key: string;
  label: string;
}

/** A content may belong to several groups (one per tag), to one, or to none. */
export type GroupKeyOf = (record: ContentRecord) => Grouping | Grouping[] | null;

const groupsOf = (keyOf: GroupKeyOf, record: ContentRecord): Grouping[] => {
  const result = keyOf(record);
  return result === null ? [] : Array.isArray(result) ? result : [result];
};

export interface GroupStat extends Grouping {
  samples: number;
  average: number;
  best: ContentRecord;
}

/** Average of a metric per group, only with contents that measured it. Highest first. */
export function groupStats(records: ContentRecord[], keyOf: GroupKeyOf, metric: AnalysisMetric, scoreOf: ScoreOf): GroupStat[] {
  const groups = new Map<string, { label: string; values: number[]; best: ContentRecord; bestValue: number }>();
  for (const record of records) {
    const value = metricValue(record.metrics, metric, scoreOf, accountKey(record));
    if (value === null) continue;
    for (const group of groupsOf(keyOf, record)) {
      const current = groups.get(group.key);
      if (!current) groups.set(group.key, { label: group.label, values: [value], best: record, bestValue: value });
      else {
        current.values.push(value);
        if (value > current.bestValue) Object.assign(current, { best: record, bestValue: value });
      }
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, samples: group.values.length, average: average(group.values), best: group.best }))
    .sort((a, b) => b.average - a.average || b.samples - a.samples);
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function slideBucket(count: number): Grouping {
  if (count <= 5) return { key: 'ate5', label: 'até 5 slides' };
  if (count <= 8) return { key: '6a8', label: '6 a 8 slides' };
  return { key: '9mais', label: '9 ou mais slides' };
}

/** Exact slide count, for the "Quantidade de slides" ranking. */
export function exactSlides(record: ContentRecord): Grouping | null {
  const count = record.slideCount ?? record.dna?.slideCount ?? null;
  return record.format === 'carrossel' && count ? { key: String(count), label: `${count} slides` } : null;
}

/** Parts of the day, since a handful of posts per exact hour says nothing. */
const DAY_PARTS: { until: number; key: string; label: string }[] = [
  { until: 6, key: 'madrugada', label: 'Madrugada (0h–6h)' },
  { until: 12, key: 'manha', label: 'Manhã (6h–12h)' },
  { until: 18, key: 'tarde', label: 'Tarde (12h–18h)' },
  { until: 24, key: 'noite', label: 'Noite (18h–24h)' },
];

function dayPart(time: string | null): Grouping | null {
  if (!time) return null;
  const hour = Number(time.slice(0, 2));
  const part = DAY_PARTS.find((item) => hour < item.until);
  return part ? { key: part.key, label: part.label } : null;
}

export const GROUP_KEYS = {
  format: (record: ContentRecord): Grouping => ({ key: record.format, label: CONTENT_FORMAT_LABELS[record.format] }),
  hookType: (record: ContentRecord): Grouping | null => (record.hookType ? { key: record.hookType, label: HOOK_TYPE_LABELS[record.hookType] } : null),
  pillar: (record: ContentRecord): Grouping | null => (record.pillar ? { key: record.pillar, label: PILLAR_LABELS[record.pillar] } : null),
  objective: (record: ContentRecord): Grouping | null => (record.objective ? { key: record.objective, label: OBJECTIVE_LABELS[record.objective] } : null),
  contentType: (record: ContentRecord): Grouping | null => (record.contentType ? { key: record.contentType, label: CONTENT_TYPE_LABELS[record.contentType] } : null),
  theme: (record: ContentRecord): Grouping | null => (record.theme ? { key: record.theme.toLowerCase(), label: record.theme } : null),
  template: (record: ContentRecord): Grouping | null => (record.visualStyle ? { key: record.visualStyle, label: VISUAL_STYLE_LABELS[record.visualStyle] } : null),
  postingTime: (record: ContentRecord): Grouping | null => dayPart(record.publishedTime),
  tag: (record: ContentRecord): Grouping[] => record.tags.map((tag) => ({ key: tag, label: `#${tag}` })),
  slides: (record: ContentRecord): Grouping | null => {
    const count = record.slideCount ?? record.dna?.slideCount ?? null;
    return record.format === 'carrossel' && count ? slideBucket(count) : null;
  },
  productPlacement: (record: ContentRecord): Grouping | null =>
    record.dna ? { key: record.dna.productPlacement, label: PRODUCT_PLACEMENT_LABELS[record.dna.productPlacement].toLowerCase() } : null,
} satisfies Record<string, GroupKeyOf>;

export const NOT_ENOUGH_DATA = 'Ainda não existem dados suficientes para gerar esse insight com confiança.';
