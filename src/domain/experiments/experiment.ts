import { isScheduled, normalizeTime, type Carousel } from '../carousel';
import { isMeasured, type AnalyticsItem } from '../analytics/items';
import { pooledRate } from '../analytics/summary';
import type { ScoreOf } from '../winners/insights';
import { accountKey, recordDay } from '../winners/record';

/**
 * Controle de Testes: an experiment groups contents that differ in one variable, states a hypothesis,
 * and turns the results into a learning. Results never claim more than the sample supports.
 */

export const TEST_VARIABLES = ['gancho', 'tema', 'design', 'cta', 'slides', 'estrutura', 'copy', 'horario', 'conta', 'template', 'outro'] as const;
export type TestVariable = (typeof TEST_VARIABLES)[number];
export const TEST_VARIABLE_LABELS: Record<TestVariable, string> = {
  gancho: 'Gancho',
  tema: 'Tema',
  design: 'Design',
  cta: 'CTA',
  slides: 'Número de slides',
  estrutura: 'Estrutura',
  copy: 'Copy',
  horario: 'Horário',
  conta: 'Conta',
  template: 'Template',
  outro: 'Outro',
};

/** What decides the winner of a test. */
export const TEST_METRICS = ['score', 'shares', 'saves', 'follows'] as const;
export type TestMetric = (typeof TEST_METRICS)[number];
export const TEST_METRIC_LABELS: Record<TestMetric, string> = {
  score: 'Performance Score',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  follows: 'Seguidores',
};

/** A test compares at most this many posting times. */
export const MAX_TEST_TIMES = 4;

/** The two sides of one tested variable, e.g. Gancho: "5 hábitos..." x "Você não precisa...". */
export interface VariableSides {
  control: string;
  variation: string;
}

export type VariableDetails = Partial<Record<TestVariable, VariableSides>>;

export interface Experiment {
  id: string;
  name: string;
  /** Account whose history keeps the learning; null for tests across accounts. */
  accountId: string | null;
  /** Main variable: the first of `variables`, kept for older screens and experiments. */
  variable: TestVariable;
  /** Everything this test changes at once (Horário + Gancho...). Older experiments have only `variable`. */
  variables: TestVariable[];
  /** Control and variation of each variable in `variables`. */
  details: VariableDetails;
  hypothesis: string;
  /** Original version, e.g. "5 hábitos para ter mais disciplina". */
  control: string;
  /** Tested version, e.g. "Você não precisa de mais disciplina". */
  variation: string;
  /** Metric that decides which version won. Older experiments use the Performance Score. */
  goalMetric: TestMetric;
  /** Planned posting times ("08:00"). In a time test, each one is a version. */
  times: string[];
  /** What was learned, written by the user when concluding. */
  learning: string;
  concludedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExperimentInput = Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>;

export const EXPERIMENT_LIMITS = { name: 80, hypothesis: 400, version: 300, learning: 1000 } as const;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function emptyExperiment(accountId: string | null, variable: TestVariable = 'gancho'): ExperimentInput {
  return { name: '', accountId, variable, variables: [variable], details: {}, hypothesis: '', control: '', variation: '', goalMetric: 'score', times: [], learning: '', concludedAt: null };
}

const isVariable = (value: unknown): value is TestVariable => TEST_VARIABLES.includes(value as TestVariable);

/** Every variable of a test, for experiments saved before tests could change several things. */
export function variablesOf(experiment: Pick<Experiment, 'variable'> & Partial<Pick<Experiment, 'variables'>>): TestVariable[] {
  return experiment.variables?.length ? experiment.variables : [experiment.variable];
}

/** "Horário + Gancho". */
export function variablesLabel(experiment: Pick<Experiment, 'variable'> & Partial<Pick<Experiment, 'variables'>>): string {
  return variablesOf(experiment).map((variable) => TEST_VARIABLE_LABELS[variable]).join(' + ');
}

export function sanitizeExperimentInput(raw: Partial<ExperimentInput>): ExperimentInput {
  const listed = Array.isArray(raw.variables) ? [...new Set(raw.variables.filter(isVariable))] : [];
  const variables = listed.length > 0 ? listed : [isVariable(raw.variable) ? raw.variable : 'outro'];
  const rawDetails = (raw.details ?? {}) as Record<string, Partial<VariableSides> | undefined>;
  const details: VariableDetails = {};
  for (const [index, variable] of variables.entries()) {
    const sides = rawDetails[variable] ?? (index === 0 ? { control: raw.control, variation: raw.variation } : {});
    details[variable] = { control: text(sides.control, EXPERIMENT_LIMITS.version), variation: text(sides.variation, EXPERIMENT_LIMITS.version) };
  }
  const main = details[variables[0]] ?? { control: '', variation: '' };
  return {
    name: text(raw.name, EXPERIMENT_LIMITS.name),
    accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null,
    variable: variables[0],
    variables,
    details,
    hypothesis: text(raw.hypothesis, EXPERIMENT_LIMITS.hypothesis),
    control: main.control,
    variation: main.variation,
    goalMetric: TEST_METRICS.includes(raw.goalMetric as TestMetric) ? (raw.goalMetric as TestMetric) : 'score',
    times: sanitizeTimes(raw.times),
    learning: text(raw.learning, EXPERIMENT_LIMITS.learning),
    concludedAt: typeof raw.concludedAt === 'string' ? raw.concludedAt : null,
  };
}

/** Valid "HH:MM" times, without repeats, in clock order. */
export function sanitizeTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.map(normalizeTime).filter((time): time is string => time !== null);
  return [...new Set(valid)].sort().slice(0, MAX_TEST_TIMES);
}

export function toExperimentInput(experiment: Experiment): ExperimentInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = experiment;
  return input;
}

/**
 * Every experiment: the ones created in Testes plus the format tests made before experiments existed
 * (carousels that only carry an experiment reference), shown as Design tests.
 */
export function allExperiments(entities: Experiment[], carousels: Carousel[]): Experiment[] {
  const known = new Set(entities.map((experiment) => experiment.id));
  const legacy = new Map<string, Experiment>();
  for (const carousel of carousels) {
    const ref = carousel.experiment;
    if (!ref || known.has(ref.id) || legacy.has(ref.id)) continue;
    legacy.set(ref.id, {
      id: ref.id,
      name: ref.name,
      accountId: carousel.source.accountId ?? null,
      variable: 'design',
      variables: ['design'],
      details: {},
      hypothesis: '',
      control: '',
      variation: '',
      goalMetric: 'score',
      times: [],
      learning: '',
      concludedAt: null,
      createdAt: carousel.createdAt,
      updatedAt: carousel.updatedAt,
    });
  }
  return [...entities, ...legacy.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const EXPERIMENT_STATUSES = ['planejado', 'em_andamento', 'dados_insuficientes', 'concluido'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  dados_insuficientes: 'Dados insuficientes',
  concluido: 'Concluído',
};

export type Confidence = 'baixa' | 'media' | 'alta';
export const CONFIDENCE_LABELS: Record<Confidence, string> = { baixa: 'Confiança: baixa', media: 'Confiança: média', alta: 'Confiança: alta' };

export interface VariantResult {
  label: string;
  items: AnalyticsItem[];
  measured: number;
  averageScore: number | null;
  shareRate: number | null;
  saveRate: number | null;
  followRate: number | null;
}

export interface ExperimentResult {
  status: ExperimentStatus;
  variants: VariantResult[];
  /** Variant with the best average score, once at least two variants have numbers. */
  leader: VariantResult | null;
  confidence: Confidence | null;
  message: string;
  period: { from: string; to: string } | null;
  members: number;
}

/** With fewer posts than this per variant, any pattern is anecdotal. */
const SOLID_SAMPLES = 3;
const DAYS_TO_WAIT = 7;

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);

/** Variant name of a member: the label set when it joined the test, or its title. */
export function variantOf(item: AnalyticsItem): string {
  return item.carousel?.experiment?.variant || item.record.title;
}

/** Groups a member under a version; by default its full version name. */
export type GroupOf = (item: AnalyticsItem) => string;

export function evaluateExperiment(experiment: Experiment, members: AnalyticsItem[], scoreOf: ScoreOf, today: string, planned = 0, groupOf: GroupOf = variantOf): ExperimentResult {
  const groups = new Map<string, AnalyticsItem[]>();
  for (const item of members) groups.set(groupOf(item), [...(groups.get(groupOf(item)) ?? []), item]);
  // Sorted so versions read in order: 08:00 before 19:00, Controle before Variação.
  const variants: VariantResult[] = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(([label, items]) => {
    const measured = items.filter(isMeasured);
    const scores = measured.map((item) => scoreOf(item.record.metrics, accountKey(item.record))).filter((value): value is number => value !== null);
    return {
      label,
      items,
      measured: measured.length,
      averageScore: mean(scores),
      shareRate: pooledRate(measured, 'shares'),
      saveRate: pooledRate(measured, 'saves'),
      followRate: pooledRate(measured, 'follows'),
    };
  });
  // A carousel only scheduled for today is not posted yet.
  const posted = members.filter((item) => item.record.publishedAt && recordDay(item.record) <= today && !(item.carousel && isScheduled(item.carousel)));
  const days = posted.map((item) => recordDay(item.record)).sort();
  const period = days.length ? { from: days[0], to: days[days.length - 1] } : null;
  const goal = goalValue(experiment.goalMetric ?? 'score');
  const ranked = variants.filter((variant) => goal(variant) !== null).sort((a, b) => (goal(b) ?? 0) - (goal(a) ?? 0));
  const leader = ranked.length >= 2 ? ranked[0] : null;

  let confidence: Confidence | null = null;
  let message: string;
  if (leader) {
    const minSamples = Math.min(...ranked.map((variant) => variant.measured));
    const { clear, visible } = goalGap(experiment.goalMetric ?? 'score', goal(ranked[0]) ?? 0, goal(ranked[1]) ?? 0);
    confidence = minSamples >= SOLID_SAMPLES && clear ? 'alta' : minSamples >= 2 && visible ? 'media' : 'baixa';
    message =
      confidence === 'baixa'
        ? 'Esse padrão apareceu neste teste, mas ainda existem poucos dados para considerá-lo um padrão consolidado.'
        : confidence === 'media'
          ? 'O resultado se repetiu em mais de um conteúdo por versão. Vale confirmar com mais uma rodada.'
          : 'Diferença clara e repetida em vários conteúdos por versão.';
  } else {
    message = members.length + planned === 0 ? 'Nenhum conteúdo nesse teste ainda.' : 'Os resultados aparecem quando pelo menos duas versões tiverem métricas.';
  }

  let status: ExperimentStatus;
  if (experiment.concludedAt) status = 'concluido';
  else if (posted.length === 0) status = 'planejado';
  else if (leader) status = 'em_andamento';
  // The newest version needs a week to collect numbers before the test is called short of data.
  else status = period && daysBetween(period.to, today) >= DAYS_TO_WAIT ? 'dados_insuficientes' : 'em_andamento';

  return { status, variants, leader, confidence, message, period, members: members.length + planned };
}

/** The number a variant is ranked by, for the metric the test cares about. */
function goalValue(metric: TestMetric): (variant: VariantResult) => number | null {
  if (metric === 'shares') return (variant) => variant.shareRate;
  if (metric === 'saves') return (variant) => variant.saveRate;
  if (metric === 'follows') return (variant) => variant.followRate;
  return (variant) => variant.averageScore;
}

/** Score points are compared as a difference; rates, relative to the runner-up (a 30% bigger rate is clear). */
function goalGap(metric: TestMetric, first: number, second: number): { clear: boolean; visible: boolean } {
  if (metric === 'score') return { clear: first - second >= 15, visible: first - second >= 10 };
  const lift = second > 0 ? (first - second) / second : first > 0 ? Infinity : 0;
  return { clear: lift >= 0.3, visible: lift >= 0.15 };
}

export type CoverageLevel = 'bastante' | 'pouco' | 'nunca';
export const COVERAGE_INFO: Record<CoverageLevel, { emoji: string; label: string }> = {
  bastante: { emoji: '✅', label: 'bastante testado' },
  pouco: { emoji: '⚠️', label: 'pouco testado' },
  nunca: { emoji: '❌', label: 'ainda não testado' },
};

/** Mapa de testes: how often each element was put to the test. */
export function testMap(experiments: Experiment[]): { variable: TestVariable; count: number; level: CoverageLevel }[] {
  return TEST_VARIABLES.filter((variable) => variable !== 'outro').map((variable) => {
    const count = experiments.filter((experiment) => variablesOf(experiment).includes(variable)).length;
    return { variable, count, level: count >= 3 ? 'bastante' : count >= 1 ? 'pouco' : 'nunca' };
  });
}

/** Learnings saved by the user, newest first: the history of what each account found out. */
export function learnings(experiments: Experiment[]): Experiment[] {
  return experiments.filter((experiment) => experiment.learning).sort((a, b) => (b.concludedAt ?? b.updatedAt).localeCompare(a.concludedAt ?? a.updatedAt));
}
