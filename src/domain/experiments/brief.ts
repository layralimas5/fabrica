import { sanitizeExperimentInput, sanitizeTimes, TEST_VARIABLE_LABELS, type ExperimentInput, type TestMetric, type TestVariable, type VariableDetails, type VariableSides } from './experiment';

/**
 * Ficha do teste: filled on the create screen, it turns the whole batch into one experiment.
 * A test may change several things at once; each carousel's version joins one part per kind of variable:
 * - design / template: the slide model of the carousel;
 * - horario: the posting time, the carousels taking turns over the times;
 * - anything else: Controle or Variação, marked on each copy.
 * So "Horário + Gancho" gives versions like "Controle · 08:00" and "Variação · 19:00".
 */
export interface TestBrief {
  name: string;
  variables: TestVariable[];
  hypothesis: string;
  /** Control and variation written for each selected variable. */
  details: VariableDetails;
  goalMetric: TestMetric;
  /** Posting times. One time keeps every version at the same hour; testing Horário needs two or more. */
  times: string[];
}

export const VERSION_LABELS = ['Controle', 'Variação', 'Variação 2', 'Variação 3'] as const;
export type VersionLabel = (typeof VERSION_LABELS)[number];

const BY_STYLE: TestVariable[] = ['design', 'template'];

export const versionsComeFromStyle = (variable: TestVariable) => BY_STYLE.includes(variable);
export const versionsComeFromTime = (variable: TestVariable) => variable === 'horario';
const chosenPerCopy = (variable: TestVariable) => !versionsComeFromStyle(variable) && !versionsComeFromTime(variable);
/** The copy boxes show a Controle / Variação choice when any selected variable is written in the copy. */
export const versionsChosenPerCopy = (variables: TestVariable[]) => variables.some(chosenPerCopy);
export const testsTime = (variables: TestVariable[]) => variables.some(versionsComeFromTime);

/** What the ficha asks for each variable: the two sides, in the words of that variable. */
export interface VariableQuestions {
  control: string;
  variation: string;
  controlPlaceholder: string;
  variationPlaceholder: string;
  /** Short note under the fields, when the versions come from somewhere else. */
  note?: string;
  hypothesis: string;
}

export const VARIABLE_QUESTIONS: Record<TestVariable, VariableQuestions | null> = {
  // Horário is answered with the list of times, not with two texts.
  horario: null,
  gancho: {
    control: 'Gancho atual',
    variation: 'Gancho testado',
    controlPlaceholder: '5 hábitos para ter mais disciplina.',
    variationPlaceholder: 'Você não precisa de mais disciplina.',
    hypothesis: 'Ganchos contrarian geram mais compartilhamentos do que ganchos educativos.',
  },
  tema: {
    control: 'Tema A',
    variation: 'Tema B',
    controlPlaceholder: 'Metas e planejamento',
    variationPlaceholder: 'Rotina e execução',
    hypothesis: 'Temas de execução prendem mais do que temas de planejamento.',
  },
  design: {
    control: 'Modelo atual',
    variation: 'Modelo testado',
    controlPlaceholder: 'Minimalista',
    variationPlaceholder: 'TikTok (foto + texto)',
    note: 'As versões são os modelos marcados em "Testar formatos".',
    hypothesis: 'Um formato mais nativo da plataforma gera mais compartilhamentos.',
  },
  cta: {
    control: 'CTA atual',
    variation: 'CTA testado',
    controlPlaceholder: 'Salva pra ver depois.',
    variationPlaceholder: 'Manda pra quem precisa ler isso.',
    hypothesis: 'Pedir pra mandar pra alguém gera mais compartilhamentos do que pedir pra salvar.',
  },
  slides: {
    control: 'Slides hoje',
    variation: 'Slides no teste',
    controlPlaceholder: '9 slides',
    variationPlaceholder: '5 slides',
    hypothesis: 'Carrosséis mais curtos são vistos até o fim por mais gente.',
  },
  estrutura: {
    control: 'Estrutura atual',
    variation: 'Estrutura testada',
    controlPlaceholder: 'Lista de 5 itens',
    variationPlaceholder: 'História: problema, virada, solução',
    hypothesis: 'Contar como história segura mais do que listar.',
  },
  copy: {
    control: 'Copy atual',
    variation: 'Copy testada',
    controlPlaceholder: 'Frases longas, tom explicativo',
    variationPlaceholder: 'Frases curtas, tom de conversa',
    hypothesis: 'Copy mais curta e direta gera mais salvamentos.',
  },
  conta: null,
  template: {
    control: 'Template que a conta já usa',
    variation: 'Template testado',
    controlPlaceholder: 'Editorial',
    variationPlaceholder: 'Templates pouco testados',
    note: 'A versão de cada carrossel é o modelo de slide que ele usou.',
    hypothesis: 'Templates pouco usados podem performar acima da média da conta.',
  },
  outro: {
    control: 'Versão A',
    variation: 'Versão B',
    controlPlaceholder: 'Como é hoje',
    variationPlaceholder: 'O que muda',
    hypothesis: '',
  },
};

const TIME_HYPOTHESIS = 'Postar no fim do dia traz mais alcance e salvamentos do que de manhã.';
const DEFAULT_TIMES = ['08:00', '19:00'];

const hypothesisFor = (variable: TestVariable) => (versionsComeFromTime(variable) ? TIME_HYPOTHESIS : (VARIABLE_QUESTIONS[variable]?.hypothesis ?? ''));
const defaultName = (variables: TestVariable[], number: number) => `Teste de ${variables.map((variable) => TEST_VARIABLE_LABELS[variable]).join(' + ')} #${String(number).padStart(2, '0')}`;
const DEFAULT_NAME = /^Teste de .+ #(\d+)$/;
const emptySides = (): VariableSides => ({ control: '', variation: '' });

export function defaultBrief(variables: TestVariable[], number = 1): TestBrief {
  return {
    name: defaultName(variables, number),
    variables,
    hypothesis: variables.length > 0 ? hypothesisFor(variables[0]) : '',
    details: Object.fromEntries(variables.map((variable) => [variable, emptySides()])),
    goalMetric: 'score',
    times: testsTime(variables) ? DEFAULT_TIMES : [],
  };
}

/**
 * Changes what the ficha tests. A name or hypothesis the user never touched follows the new selection;
 * anything written by hand stays. Adding Horário turns the single posting time into two versions.
 */
export function setVariables<T extends TestBrief>(brief: T, variables: TestVariable[]): T {
  const number = DEFAULT_NAME.exec(brief.name)?.[1];
  const untouchedName = number !== undefined && brief.name === defaultName(brief.variables, Number(number));
  const untouchedHypothesis = brief.hypothesis === '' || brief.variables.some((variable) => hypothesisFor(variable) === brief.hypothesis);
  const times = testsTime(variables)
    ? brief.times.length >= 2
      ? brief.times
      : brief.times.length === 1
        ? [brief.times[0], brief.times[0] < '12:00' ? '19:00' : '08:00']
        : DEFAULT_TIMES
    : brief.times.slice(0, 1);
  return {
    ...brief,
    variables,
    name: untouchedName ? defaultName(variables, Number(number)) : brief.name,
    hypothesis: untouchedHypothesis ? (variables.length > 0 ? hypothesisFor(variables[0]) : '') : brief.hypothesis,
    details: Object.fromEntries(variables.map((variable) => [variable, brief.details[variable] ?? emptySides()])),
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
  /** How many carousels of the same version came before this one: picks its turn among the times. */
  position: number;
  /** Label of the slide model used by this carousel. */
  styleLabel: string;
  /** Version marked on the copy box. */
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
  const byTime = testsTime(brief.variables) && times.length > 0;
  const time = byTime ? times[position % times.length] : (times[0] ?? null);
  const parts = [
    versionsChosenPerCopy(brief.variables) ? copyVersion?.trim() || defaultVersion(copyIndex) : null,
    brief.variables.some(versionsComeFromStyle) ? styleLabel : null,
    byTime ? time : null,
  ].filter((part): part is string => Boolean(part));
  return { variant: parts.join(' · ') || defaultVersion(copyIndex), time };
}

/**
 * Hands out versions and times in creation order. The times rotate inside each version (each copy version and
 * slide model), so with Gancho + Horário the Controle also goes out at 19:00 and the Variação at 08:00:
 * otherwise every Controle would land on the same hour and the two variables could not be told apart.
 */
export function slotPlanner(brief: TestBrief): (input: Omit<SlotInput, 'position'>) => TestSlot {
  const rounds = new Map<string, number>();
  return (input) => {
    const group = [versionsChosenPerCopy(brief.variables) ? input.copyVersion?.trim() || defaultVersion(input.copyIndex) : '', brief.variables.some(versionsComeFromStyle) ? input.styleLabel : ''].join('|');
    const round = rounds.get(group) ?? 0;
    rounds.set(group, round + 1);
    return slotFor(brief, { ...input, position: round });
  };
}

/** One part of a combined version name ("Controle · 08:00"): which variables it stands for and where it sits. */
export interface VersionDimension {
  label: string;
  index: number;
  /** Where the part comes from: the copy (Controle/Variação), the slide model or the posting time. */
  kind: 'copy' | 'style' | 'time';
}

/** The parts a version name is made of, in the order slotFor joins them. Only worth showing with two or more. */
export function versionDimensions(variables: TestVariable[]): VersionDimension[] {
  const perCopy = variables.filter(chosenPerCopy);
  const parts: Omit<VersionDimension, 'index'>[] = [
    ...(perCopy.length > 0 ? [{ label: perCopy.map((variable) => TEST_VARIABLE_LABELS[variable]).join(' + '), kind: 'copy' as const }] : []),
    ...(variables.some(versionsComeFromStyle) ? [{ label: 'Modelo', kind: 'style' as const }] : []),
    ...(testsTime(variables) ? [{ label: TEST_VARIABLE_LABELS.horario, kind: 'time' as const }] : []),
  ];
  return parts.map((part, index) => ({ ...part, index }));
}

/** The part of a combined version name for one dimension: "Controle · 08:00" by Horário is "08:00". */
export function versionPart(variant: string, index: number): string {
  return variant.split(' · ')[index] ?? variant;
}

interface BatchShape {
  /** Carousels the batch will create, format variants included. */
  carousels: number;
  /** Slide models chosen (a format test has two or more). */
  styles: number;
  /** Versions of the filled copy boxes. */
  copyVersions: string[];
}

/** What stops the test from comparing anything, in words the user can act on. Empty means ready. */
export function briefProblems(brief: TestBrief, batch: BatchShape): string[] {
  const problems: string[] = [];
  if (!brief.name.trim()) problems.push('Dê um nome pro teste.');
  if (brief.variables.length === 0) problems.push('Escolha o que está testando.');
  const times = sanitizeTimes(brief.times);
  if (testsTime(brief.variables)) {
    if (times.length < 2) problems.push('Pra testar horário, coloque pelo menos 2 horários diferentes.');
    else if (batch.carousels < times.length) problems.push(`Pra testar ${times.length} horários, crie pelo menos ${times.length} carrosséis.`);
  }
  if (brief.variables.some(versionsComeFromStyle) && batch.styles < 2) problems.push('Marque pelo menos 2 modelos de slide pra comparar.');
  if (versionsChosenPerCopy(brief.variables) && new Set(batch.copyVersions).size < 2) {
    problems.push('Marque nas copys qual é o Controle e qual é a Variação: o teste precisa das duas.');
  }
  return problems;
}

export function experimentFromBrief(brief: TestBrief, accountId: string | null): ExperimentInput {
  return sanitizeExperimentInput({ ...brief, variable: brief.variables[0], accountId, learning: '', appliedWinner: null, concludedAt: null });
}
