import { sanitizeExperimentInput, sanitizeTimes, TEST_VARIABLE_LABELS, type ExperimentInput, type TestMetric, type TestVariable } from './experiment';

/**
 * Ficha do teste: filled on the create screen, it turns the whole batch into one experiment.
 * Each carousel joins it under a version, decided by what is being tested:
 * - design / template: the slide model of the carousel is the version;
 * - horario: the posting time is the version, and the carousels take turns over the times;
 * - anything else: the user marks each copy as Controle or Variação.
 */
export interface TestBrief {
  name: string;
  variable: TestVariable;
  hypothesis: string;
  control: string;
  variation: string;
  goalMetric: TestMetric;
  /** Posting times. One time keeps every version at the same hour; a time test needs two or more. */
  times: string[];
}

export const VERSION_LABELS = ['Controle', 'Variação', 'Variação 2', 'Variação 3'] as const;
export type VersionLabel = (typeof VERSION_LABELS)[number];

/** Variables whose version comes from the slide model, not from a choice per copy. */
const BY_STYLE: TestVariable[] = ['design', 'template'];

export const versionsComeFromStyle = (variable: TestVariable) => BY_STYLE.includes(variable);
export const versionsComeFromTime = (variable: TestVariable) => variable === 'horario';
/** The copy boxes show a Controle / Variação choice. */
export const versionsChosenPerCopy = (variable: TestVariable) => !versionsComeFromStyle(variable) && !versionsComeFromTime(variable);

const SUGGESTIONS: Partial<Record<TestVariable, Pick<TestBrief, 'hypothesis' | 'control' | 'variation'>>> = {
  horario: { hypothesis: 'Postar no fim do dia traz mais alcance e salvamentos do que de manhã.', control: '', variation: '' },
  design: { hypothesis: 'Um formato mais nativo da plataforma gera mais compartilhamentos.', control: 'Modelo atual', variation: 'Modelo novo' },
  template: { hypothesis: 'Templates pouco usados podem performar acima da média da conta.', control: 'O que a conta já usa', variation: 'Templates pouco testados' },
  gancho: { hypothesis: 'Ganchos contrarian geram mais compartilhamentos do que ganchos educativos.', control: '', variation: '' },
};

const suggestionFor = (variable: TestVariable) => SUGGESTIONS[variable] ?? { hypothesis: '', control: '', variation: '' };
const defaultName = (variable: TestVariable, number: number) => `Teste de ${TEST_VARIABLE_LABELS[variable]} #${String(number).padStart(2, '0')}`;
const DEFAULT_NAME = /^Teste de .+ #(\d+)$/;

export function defaultBrief(variable: TestVariable, number = 1): TestBrief {
  return { name: defaultName(variable, number), variable, goalMetric: 'score', times: versionsComeFromTime(variable) ? ['08:00', '19:00'] : [], ...suggestionFor(variable) };
}

/**
 * Changes what the ficha tests. Fields the user never touched (still empty or the old suggestion)
 * take the new variable's suggestions; anything written by hand stays. A time test gets two times.
 */
export function switchVariable(brief: TestBrief, variable: TestVariable): TestBrief {
  const before = suggestionFor(brief.variable);
  const after = suggestionFor(variable);
  const keep = (field: keyof typeof before) => (brief[field] === '' || brief[field] === before[field] ? after[field] : brief[field]);
  const number = DEFAULT_NAME.exec(brief.name)?.[1];
  const untouchedName = number !== undefined && brief.name === defaultName(brief.variable, Number(number));
  const times = versionsComeFromTime(variable)
    ? brief.times.length >= 2
      ? brief.times
      : brief.times.length === 1
        ? [brief.times[0], brief.times[0] < '12:00' ? '19:00' : '08:00']
        : ['08:00', '19:00']
    : brief.times.slice(0, 1);
  return {
    ...brief,
    variable,
    name: untouchedName ? defaultName(variable, Number(number)) : brief.name,
    hypothesis: keep('hypothesis'),
    control: keep('control'),
    variation: keep('variation'),
    times,
  };
}

/** Default version of each copy box: alternating Controle and Variação. */
export function defaultVersion(index: number): VersionLabel {
  return index % 2 === 0 ? 'Controle' : 'Variação';
}

export interface SlotInput {
  /** Position of the copy box the carousel came from. */
  copyIndex: number;
  /** Position of the carousel in the whole batch (format variants share it). */
  position: number;
  /** Label of the slide model used by this carousel. */
  styleLabel: string;
  /** Version marked on the copy box, when versions are chosen per copy. */
  copyVersion: string | null;
}

export interface TestSlot {
  variant: string;
  /** Posting time; null leaves the carousel without a time. */
  time: string | null;
}

/** Version and posting time of one carousel of the test. */
export function slotFor(brief: TestBrief, { copyIndex, position, styleLabel, copyVersion }: SlotInput): TestSlot {
  const times = sanitizeTimes(brief.times);
  if (versionsComeFromTime(brief.variable) && times.length > 0) {
    const time = times[position % times.length];
    return { variant: time, time };
  }
  const time = times[0] ?? null;
  if (versionsComeFromStyle(brief.variable)) return { variant: styleLabel, time };
  return { variant: copyVersion?.trim() || defaultVersion(copyIndex), time };
}

interface BatchShape {
  /** Carousels the batch will create, format variants included. */
  carousels: number;
  /** Slide models chosen (a format test has two or more). */
  styles: number;
  /** Versions of the filled copy boxes, when chosen per copy. */
  copyVersions: string[];
}

/** What stops the test from comparing anything, in words the user can act on. Empty means ready. */
export function briefProblems(brief: TestBrief, batch: BatchShape): string[] {
  const problems: string[] = [];
  if (!brief.name.trim()) problems.push('Dê um nome pro teste.');
  const times = sanitizeTimes(brief.times);
  if (versionsComeFromTime(brief.variable)) {
    if (times.length < 2) problems.push('Pra testar horário, coloque pelo menos 2 horários diferentes.');
    else if (batch.carousels < times.length) problems.push(`Pra testar ${times.length} horários, crie pelo menos ${times.length} carrosséis.`);
  } else if (brief.variable === 'design' && batch.styles < 2) {
    problems.push('Pra testar formato, marque pelo menos 2 modelos de slide.');
  } else if (versionsChosenPerCopy(brief.variable) && new Set(batch.copyVersions).size < 2) {
    problems.push('Um teste precisa de pelo menos 2 versões: marque qual copy é Controle e qual é Variação.');
  }
  return problems;
}

export function experimentFromBrief(brief: TestBrief, accountId: string | null): ExperimentInput {
  return sanitizeExperimentInput({ ...brief, accountId, learning: '', concludedAt: null });
}
