import type { Carousel } from '../carousel';
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

export interface Experiment {
  id: string;
  name: string;
  /** Account whose history keeps the learning; null for tests across accounts. */
  accountId: string | null;
  variable: TestVariable;
  hypothesis: string;
  /** Original version, e.g. "5 hábitos para ter mais disciplina". */
  control: string;
  /** Tested version, e.g. "Você não precisa de mais disciplina". */
  variation: string;
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
  return { name: '', accountId, variable, hypothesis: '', control: '', variation: '', learning: '', concludedAt: null };
}

export function sanitizeExperimentInput(raw: Partial<ExperimentInput>): ExperimentInput {
  return {
    name: text(raw.name, EXPERIMENT_LIMITS.name),
    accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null,
    variable: TEST_VARIABLES.includes(raw.variable as TestVariable) ? (raw.variable as TestVariable) : 'outro',
    hypothesis: text(raw.hypothesis, EXPERIMENT_LIMITS.hypothesis),
    control: text(raw.control, EXPERIMENT_LIMITS.version),
    variation: text(raw.variation, EXPERIMENT_LIMITS.version),
    learning: text(raw.learning, EXPERIMENT_LIMITS.learning),
    concludedAt: typeof raw.concludedAt === 'string' ? raw.concludedAt : null,
  };
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
      hypothesis: '',
      control: '',
      variation: '',
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

export function evaluateExperiment(experiment: Experiment, members: AnalyticsItem[], scoreOf: ScoreOf, today: string, planned = 0): ExperimentResult {
  const groups = new Map<string, AnalyticsItem[]>();
  for (const item of members) groups.set(variantOf(item), [...(groups.get(variantOf(item)) ?? []), item]);
  const variants: VariantResult[] = [...groups.entries()].map(([label, items]) => {
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
  const posted = members.filter((item) => item.record.publishedAt && recordDay(item.record) <= today);
  const days = posted.map((item) => recordDay(item.record)).sort();
  const period = days.length ? { from: days[0], to: days[days.length - 1] } : null;
  const ranked = variants.filter((variant) => variant.averageScore !== null).sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  const leader = ranked.length >= 2 ? ranked[0] : null;

  let confidence: Confidence | null = null;
  let message: string;
  if (leader) {
    const gap = (ranked[0].averageScore ?? 0) - (ranked[1].averageScore ?? 0);
    const minSamples = Math.min(...ranked.map((variant) => variant.measured));
    confidence = minSamples >= SOLID_SAMPLES && gap >= 15 ? 'alta' : minSamples >= 2 && gap >= 10 ? 'media' : 'baixa';
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

export type CoverageLevel = 'bastante' | 'pouco' | 'nunca';
export const COVERAGE_INFO: Record<CoverageLevel, { emoji: string; label: string }> = {
  bastante: { emoji: '✅', label: 'bastante testado' },
  pouco: { emoji: '⚠️', label: 'pouco testado' },
  nunca: { emoji: '❌', label: 'ainda não testado' },
};

/** Mapa de testes: how often each element was put to the test. */
export function testMap(experiments: Experiment[]): { variable: TestVariable; count: number; level: CoverageLevel }[] {
  return TEST_VARIABLES.filter((variable) => variable !== 'outro').map((variable) => {
    const count = experiments.filter((experiment) => experiment.variable === variable).length;
    return { variable, count, level: count >= 3 ? 'bastante' : count >= 1 ? 'pouco' : 'nunca' };
  });
}

/** Learnings saved by the user, newest first: the history of what each account found out. */
export function learnings(experiments: Experiment[]): Experiment[] {
  return experiments.filter((experiment) => experiment.learning).sort((a, b) => (b.concludedAt ?? b.updatedAt).localeCompare(a.concludedAt ?? a.updatedAt));
}
