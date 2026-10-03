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

export const RATE_FORMULAS: Record<RateMetric, string> = {
  engagementRate: '(curtidas + comentários + compartilhamentos + salvamentos) / visualizações',
  shareRate: 'compartilhamentos / visualizações',
  saveRate: 'salvamentos / visualizações',
  commentRate: 'comentários / visualizações',
  followRate: 'novos seguidores / visualizações',
  clickRate: 'cliques / visualizações',
  conversionRate: 'cadastros ou vendas / cliques',
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

type Dimension = keyof typeof GROUP_KEYS | 'account';

/** How each dimension reads in a sentence: "Ganchos de confronto" vs "os outros ganchos". */
const DIMENSION_PHRASES: Record<Dimension, { group: (label: string) => string; others: string }> = {
  hookType: { group: (label) => `Ganchos de ${label.toLowerCase()}`, others: 'os outros ganchos' },
  format: { group: (label) => `Conteúdos em ${label}`, others: 'os outros formatos' },
  pillar: { group: (label) => `Conteúdos do pilar ${label}`, others: 'os outros pilares' },
  objective: { group: (label) => `Conteúdos com objetivo de ${label.toLowerCase()}`, others: 'os de outros objetivos' },
  contentType: { group: (label) => `Carrosséis do tipo ${label.toLowerCase()}`, others: 'os de outros tipos' },
  theme: { group: (label) => `Conteúdos sobre ${label.toLowerCase()}`, others: 'os outros temas' },
  template: { group: (label) => `Carrosséis no template ${label}`, others: 'os outros templates' },
  postingTime: { group: (label) => `Posts publicados no período ${label.toLowerCase()}`, others: 'os de outros horários' },
  tag: { group: (label) => `Conteúdos com ${label}`, others: 'os sem essa tag' },
  slides: { group: (label) => `Carrosséis de ${label}`, others: 'os de outro tamanho' },
  productPlacement: { group: (label) => `Conteúdos em que o produto ${label}`, others: 'os demais' },
  account: { group: (label) => `Conteúdos da conta ${label}`, others: 'os das outras contas' },
};

interface InsightMetric {
  id: string;
  phrase: string;
  value: (record: ContentRecord, scoreOf: ScoreOf) => number | null;
  /** Score reads as "performando X% acima", the others as "X% mais <phrase>". */
  kind: 'more' | 'performance';
}

const INSIGHT_METRICS: InsightMetric[] = [
  { id: 'score', phrase: 'Performance Score', kind: 'performance', value: (record, scoreOf) => scoreOf(record.metrics, accountKey(record)) },
  { id: 'views', phrase: 'visualizações', kind: 'more', value: (record) => record.metrics.views },
  { id: 'shares', phrase: 'compartilhamentos por visualização', kind: 'more', value: (record) => rateValue(record.metrics, 'shareRate') },
  { id: 'saves', phrase: 'salvamentos por visualização', kind: 'more', value: (record) => rateValue(record.metrics, 'saveRate') },
  { id: 'follows', phrase: 'seguidores por visualização', kind: 'more', value: (record) => rateValue(record.metrics, 'followRate') },
  { id: 'profileVisits', phrase: 'visitas ao perfil por visualização', kind: 'more', value: (record) => (record.metrics.profileVisits !== null && record.metrics.views ? record.metrics.profileVisits / record.metrics.views : null) },
  { id: 'conversion', phrase: 'conversão por clique', kind: 'more', value: (record) => rateValue(record.metrics, 'conversionRate') },
  { id: 'signups', phrase: 'cadastros', kind: 'more', value: (record) => record.metrics.signups },
];

export const MIN_GROUP_SAMPLES = 3;
const MIN_LIFT = 0.25;
const MAX_INSIGHTS = 6;
const MIN_ACCOUNT_RECORDS = 6;

export const NOT_ENOUGH_DATA = 'Ainda não existem dados suficientes para gerar esse insight com confiança.';

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

function sentence(subject: string, others: string, metric: InsightMetric, lift: number): string {
  if (metric.kind === 'performance') {
    const amount = lift >= 1 ? `${(lift + 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x` : `${Math.round(lift * 100)}%`;
    return `${subject} estão performando ${amount} acima de ${others}.`;
  }
  return `${subject} têm ${liftLabel(lift)} ${metric.phrase} que ${others}.`;
}

function bestContrast(records: ContentRecord[], keyOf: GroupKeyOf, metric: InsightMetric, scoreOf: ScoreOf) {
  const measured = records
    .map((record) => ({ groups: groupsOf(keyOf, record), value: metric.value(record, scoreOf) }))
    .filter((entry): entry is { groups: Grouping[]; value: number } => entry.groups.length > 0 && entry.value !== null);
  const labels = new Map(measured.flatMap((entry) => entry.groups.map((group) => [group.key, group.label] as const)));
  let best: { key: string; label: string; lift: number; samples: number; compared: number } | null = null;
  for (const [key, label] of labels) {
    const inside = measured.filter((entry) => entry.groups.some((group) => group.key === key)).map((entry) => entry.value);
    const others = measured.filter((entry) => !entry.groups.some((group) => group.key === key)).map((entry) => entry.value);
    if (inside.length < MIN_GROUP_SAMPLES || others.length < MIN_GROUP_SAMPLES) continue;
    const othersAverage = average(others);
    if (othersAverage <= 0) continue;
    const lift = average(inside) / othersAverage - 1;
    if (lift >= MIN_LIFT && (!best || lift > best.lift)) best = { key, label, lift, samples: inside.length, compared: others.length };
  }
  return best;
}

/**
 * Patterns found in the user's own numbers. A sentence only appears when both sides of the comparison
 * have at least 3 measured contents and the difference is at least 25%: no data, no conclusion.
 */
export function generateInsights(records: ContentRecord[], accountLabel: (key: string) => string, scoreOf: ScoreOf = () => null): Insight[] {
  const scopes: { prefix: string; id: string; records: ContentRecord[]; withAccounts: boolean }[] = [{ prefix: '', id: 'all', records, withAccounts: true }];
  const byAccount = new Map<string, ContentRecord[]>();
  for (const record of records) {
    const key = accountKey(record);
    if (key) byAccount.set(key, [...(byAccount.get(key) ?? []), record]);
  }
  if (byAccount.size > 1) {
    for (const [key, items] of byAccount) if (items.length >= MIN_ACCOUNT_RECORDS) scopes.push({ prefix: `Na conta ${accountLabel(key)}, `, id: key, records: items, withAccounts: false });
  }

  const accountKeyOf: GroupKeyOf = (record) => {
    const key = accountKey(record);
    return key ? { key, label: accountLabel(key) } : null;
  };

  const found: Insight[] = [];
  for (const scope of scopes) {
    const dimensions: [Dimension, GroupKeyOf][] = [
      ...(Object.entries(GROUP_KEYS) as [Dimension, GroupKeyOf][]),
      ...(scope.withAccounts && byAccount.size > 1 ? ([['account', accountKeyOf]] as [Dimension, GroupKeyOf][]) : []),
    ];
    for (const [dimension, keyOf] of dimensions) {
      for (const metric of INSIGHT_METRICS) {
        const contrast = bestContrast(scope.records, keyOf, metric, scoreOf);
        if (!contrast) continue;
        const phrase = DIMENSION_PHRASES[dimension];
        const subject = phrase.group(contrast.label);
        found.push({
          id: `${scope.id}:${dimension}:${contrast.key}:${metric.id}`,
          text: sentence(scope.prefix ? `${scope.prefix}${lowerFirst(subject)}` : subject, phrase.others, metric, contrast.lift),
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
