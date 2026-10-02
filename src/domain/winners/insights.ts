import { PRODUCT_PLACEMENT_LABELS } from './dna';
import {
  accountKey,
  CONTENT_FORMAT_LABELS,
  conversionRate,
  formatMetric,
  formatPercent,
  HOOK_TYPE_LABELS,
  PERFORMANCE_LABELS,
  PILLAR_LABELS,
  type ContentRecord,
  type PerformanceKey,
  type PerformanceMetrics,
} from './record';

/** What a group is compared by on the analysis page. */
export type AnalysisMetric = PerformanceKey | 'conversionRate' | 'score';

export const ANALYSIS_METRIC_GROUPS: { label: string; options: AnalysisMetric[] }[] = [
  { label: 'Geral', options: ['score'] },
  { label: 'Atenção', options: ['views', 'likes', 'comments', 'shares', 'saves'] },
  { label: 'Interesse', options: ['profileVisits', 'clicks'] },
  { label: 'Conversão', options: ['signups', 'trials', 'sales', 'revenue', 'conversionRate'] },
];

export function analysisMetricLabel(metric: AnalysisMetric): string {
  if (metric === 'score') return 'Content Score';
  if (metric === 'conversionRate') return 'Taxa de conversão';
  return PERFORMANCE_LABELS[metric];
}

export function formatAnalysisValue(metric: AnalysisMetric, value: number): string {
  if (metric === 'score') return String(Math.round(value));
  if (metric === 'conversionRate') return formatPercent(value);
  return formatMetric(metric, Math.round(value));
}

export type ScoreOf = (metrics: PerformanceMetrics) => number | null;

export function metricValue(metrics: PerformanceMetrics, metric: AnalysisMetric, scoreOf: ScoreOf): number | null {
  if (metric === 'score') return scoreOf(metrics);
  if (metric === 'conversionRate') return conversionRate(metrics);
  return metrics[metric];
}

export interface Grouping {
  key: string;
  label: string;
}

export type GroupKeyOf = (record: ContentRecord) => Grouping | null;

export interface GroupStat extends Grouping {
  samples: number;
  average: number;
  best: ContentRecord;
}

/** Average of a metric per group, only with contents that measured it. Highest first. */
export function groupStats(records: ContentRecord[], keyOf: GroupKeyOf, metric: AnalysisMetric, scoreOf: ScoreOf): GroupStat[] {
  const groups = new Map<string, { label: string; values: number[]; best: ContentRecord; bestValue: number }>();
  for (const record of records) {
    const group = keyOf(record);
    const value = metricValue(record.metrics, metric, scoreOf);
    if (!group || value === null) continue;
    const current = groups.get(group.key);
    if (!current) groups.set(group.key, { label: group.label, values: [value], best: record, bestValue: value });
    else {
      current.values.push(value);
      if (value > current.bestValue) Object.assign(current, { best: record, bestValue: value });
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

export const GROUP_KEYS = {
  format: (record: ContentRecord): Grouping => ({ key: record.format, label: CONTENT_FORMAT_LABELS[record.format] }),
  hookType: (record: ContentRecord): Grouping | null => (record.hookType ? { key: record.hookType, label: HOOK_TYPE_LABELS[record.hookType] } : null),
  pillar: (record: ContentRecord): Grouping | null => (record.pillar ? { key: record.pillar, label: PILLAR_LABELS[record.pillar] } : null),
  theme: (record: ContentRecord): Grouping | null => (record.theme ? { key: record.theme.toLowerCase(), label: record.theme } : null),
  slides: (record: ContentRecord): Grouping | null => {
    const count = record.slideCount ?? record.dna?.slideCount ?? null;
    return record.format === 'carrossel' && count ? slideBucket(count) : null;
  },
  productPlacement: (record: ContentRecord): Grouping | null =>
    record.dna ? { key: record.dna.productPlacement, label: PRODUCT_PLACEMENT_LABELS[record.dna.productPlacement].toLowerCase() } : null,
} satisfies Record<string, GroupKeyOf>;

type Dimension = keyof typeof GROUP_KEYS;

/** How each dimension reads in a sentence: "Ganchos de confronto" vs "os outros ganchos". */
const DIMENSION_PHRASES: Record<Dimension, { group: (label: string) => string; others: string }> = {
  hookType: { group: (label) => `Ganchos de ${label.toLowerCase()}`, others: 'os outros ganchos' },
  format: { group: (label) => `Conteúdos em ${label}`, others: 'os outros formatos' },
  pillar: { group: (label) => `Conteúdos do pilar ${label}`, others: 'os outros pilares' },
  theme: { group: (label) => `Conteúdos sobre ${label.toLowerCase()}`, others: 'os outros temas' },
  slides: { group: (label) => `Carrosséis de ${label}`, others: 'os de outro tamanho' },
  productPlacement: { group: (label) => `Conteúdos em que o produto ${label}`, others: 'os demais' },
};

interface InsightMetric {
  id: string;
  phrase: string;
  value: (record: ContentRecord) => number | null;
}

const perView = (key: PerformanceKey) => (record: ContentRecord) => {
  const value = record.metrics[key];
  return value !== null && record.metrics.views ? value / record.metrics.views : null;
};

const INSIGHT_METRICS: InsightMetric[] = [
  { id: 'views', phrase: 'visualizações', value: (record) => record.metrics.views },
  { id: 'saves', phrase: 'salvamentos por visualização', value: perView('saves') },
  { id: 'shares', phrase: 'compartilhamentos por visualização', value: perView('shares') },
  { id: 'profileVisits', phrase: 'visitas ao perfil por visualização', value: perView('profileVisits') },
  { id: 'conversion', phrase: 'conversão por visualização', value: (record) => conversionRate(record.metrics) },
  { id: 'signups', phrase: 'cadastros', value: (record) => record.metrics.signups },
];

export const MIN_GROUP_SAMPLES = 3;
const MIN_LIFT = 0.25;
const MAX_INSIGHTS = 6;
const MIN_ACCOUNT_RECORDS = 6;

export interface Insight {
  id: string;
  text: string;
  /** Contents behind it: the group and what it was compared to. */
  samples: number;
  compared: number;
  lift: number;
}

function liftLabel(lift: number): string {
  return lift >= 1 ? `${(lift + 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x mais` : `${Math.round(lift * 100)}% mais`;
}

function bestContrast(records: ContentRecord[], dimension: Dimension, metric: InsightMetric) {
  const values = records.map((record) => ({ group: GROUP_KEYS[dimension](record), value: metric.value(record) }));
  const measured = values.filter((entry): entry is { group: Grouping; value: number } => entry.group !== null && entry.value !== null);
  const groups = new Map<string, { label: string; values: number[] }>();
  for (const { group, value } of measured) {
    const current = groups.get(group.key) ?? { label: group.label, values: [] };
    current.values.push(value);
    groups.set(group.key, current);
  }
  let best: { key: string; label: string; lift: number; samples: number; compared: number } | null = null;
  for (const [key, group] of groups) {
    if (group.values.length < MIN_GROUP_SAMPLES) continue;
    const others = measured.filter((entry) => entry.group.key !== key).map((entry) => entry.value);
    if (others.length < MIN_GROUP_SAMPLES) continue;
    const othersAverage = average(others);
    if (othersAverage <= 0) continue;
    const lift = average(group.values) / othersAverage - 1;
    if (lift >= MIN_LIFT && (!best || lift > best.lift)) best = { key, label: group.label, lift, samples: group.values.length, compared: others.length };
  }
  return best;
}

/**
 * Patterns found in the user's own numbers. A sentence only appears when both sides of the comparison
 * have at least 3 measured contents and the difference is at least 25%: no data, no conclusion.
 */
export function generateInsights(records: ContentRecord[], accountLabel: (key: string) => string): Insight[] {
  const scopes: { prefix: string; id: string; records: ContentRecord[] }[] = [{ prefix: '', id: 'all', records }];
  const byAccount = new Map<string, ContentRecord[]>();
  for (const record of records) {
    const key = accountKey(record);
    if (key) byAccount.set(key, [...(byAccount.get(key) ?? []), record]);
  }
  if (byAccount.size > 1) {
    for (const [key, items] of byAccount) if (items.length >= MIN_ACCOUNT_RECORDS) scopes.push({ prefix: `Na conta ${accountLabel(key)}, `, id: key, records: items });
  }

  const found: Insight[] = [];
  for (const scope of scopes) {
    for (const dimension of Object.keys(GROUP_KEYS) as Dimension[]) {
      for (const metric of INSIGHT_METRICS) {
        const contrast = bestContrast(scope.records, dimension, metric);
        if (!contrast) continue;
        const phrase = DIMENSION_PHRASES[dimension];
        const subject = phrase.group(contrast.label);
        found.push({
          id: `${scope.id}:${dimension}:${contrast.key}:${metric.id}`,
          text: `${scope.prefix}${scope.prefix ? lowerFirst(subject) : subject} têm ${liftLabel(contrast.lift)} ${metric.phrase} que ${phrase.others}.`,
          samples: contrast.samples,
          compared: contrast.compared,
          lift: contrast.lift,
        });
      }
    }
  }

  // Strongest and best supported first; one sentence per group so the list doesn't repeat itself.
  const ranked = found.sort((a, b) => b.lift * Math.sqrt(Math.min(b.samples, b.compared)) - a.lift * Math.sqrt(Math.min(a.samples, a.compared)));
  const seen = new Set<string>();
  const result: Insight[] = [];
  for (const insight of ranked) {
    const group = insight.id.split(':').slice(0, 3).join(':');
    if (seen.has(group)) continue;
    seen.add(group);
    result.push(insight);
    if (result.length === MAX_INSIGHTS) break;
  }
  return result;
}

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
