/**
 * Detector de Similaridade: how close a new content is to what an account already made.
 * It only warns, never blocks: repeating a winning format on purpose is part of the strategy,
 * so a close relative of a winner reads as a possible variation, not as a repeat.
 */

export interface ComparableContent {
  id: string;
  /** Account it belongs to; only contents of the same account are compared. */
  accountId: string | null;
  hook: string;
  /** Every slide in order (first = hook, last usually the CTA). */
  slides: string[];
  theme: string;
  /** Narrative steps from the DNA, e.g. ["gancho", "problema", "solução"]. */
  narrative: string[];
  /** 'YYYY-MM-DD' it was (or will be) published; null when never scheduled. */
  day: string | null;
  /** Winner it was created from, when it was made with "Usar como modelo"/"Criar variações". */
  originId: string | null;
  /** Marked as a winner, or with a high Performance Score: a pattern worth varying. */
  winning: boolean;
}

export interface SimilarityBreakdown {
  hook: number;
  idea: number;
  theme: number;
  structure: number;
  cta: number;
  length: number;
}

/** Weight of each aspect in the final percentage. */
const WEIGHTS: SimilarityBreakdown = { hook: 0.3, idea: 0.25, theme: 0.15, structure: 0.15, cta: 0.1, length: 0.05 };

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro com sem que se e ou mas mais menos muito muita muitos muitas ja nao sim voce voces vc seu sua seus suas meu minha meus minhas eu ele ela eles elas isso isto esse essa este esta aquilo ao aos tem ter tenho foi ser sao era esta estao como quando onde porque so tambem ainda ate ne la aqui ai entao tudo todo toda todos todas cada'.split(
    ' ',
  ),
);

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Content words with a light stem (plural and common endings), so "hábitos" meets "hábito". */
export function tokens(text: string): string[] {
  return (fold(text).match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => word.replace(/(mente|coes|cao|oes|ais|eis|res|s)$/, '') || word);
}

function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Pairs of neighbour words: catches the same sentences, not only the same vocabulary. */
function bigrams(words: string[]): string[] {
  return words.slice(1).map((word, index) => `${words[index]} ${word}`);
}

/** Longest common subsequence over the length of the longer sequence. */
function sequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
  }
  return table[a.length][b.length] / Math.max(a.length, b.length);
}

export function compareContents(a: ComparableContent, b: ComparableContent): { score: number; breakdown: SimilarityBreakdown } {
  const textA = tokens(a.slides.join(' '));
  const textB = tokens(b.slides.join(' '));
  const themeA = fold(a.theme.trim());
  const themeB = fold(b.theme.trim());
  const breakdown: SimilarityBreakdown = {
    hook: jaccard(tokens(a.hook), tokens(b.hook)),
    idea: Math.max(jaccard(textA, textB), Math.min(1, jaccard(bigrams(textA), bigrams(textB)) * 1.5)),
    theme: themeA && themeB ? (themeA === themeB ? 1 : jaccard(tokens(themeA), tokens(themeB))) : 0,
    structure: sequenceSimilarity(a.narrative, b.narrative),
    cta: a.slides.length && b.slides.length ? jaccard(tokens(a.slides[a.slides.length - 1]), tokens(b.slides[b.slides.length - 1])) : 0,
    length: a.slides.length && b.slides.length ? Math.min(a.slides.length, b.slides.length) / Math.max(a.slides.length, b.slides.length) : 0,
  };
  // When neither side has a theme, its weight goes to the idea so the scale stays 0–100.
  const weights = !themeA || !themeB ? { ...WEIGHTS, idea: WEIGHTS.idea + WEIGHTS.theme, theme: 0 } : WEIGHTS;
  const total = (Object.keys(weights) as (keyof SimilarityBreakdown)[]).reduce((sum, key) => sum + weights[key] * breakdown[key], 0);
  return { score: Math.round(Math.min(1, total) * 100), breakdown };
}

export type SimilarityBand = 'diferente' | 'algumas' | 'parecido' | 'muito';
export const SIMILARITY_BAND_LABELS: Record<SimilarityBand, string> = {
  diferente: 'Conteúdo bastante diferente',
  algumas: 'Algumas semelhanças',
  parecido: 'Conteúdo parecido',
  muito: 'Conteúdo muito parecido',
};

export function similarityBand(score: number): SimilarityBand {
  if (score < 30) return 'diferente';
  if (score < 55) return 'algumas';
  if (score < 80) return 'parecido';
  return 'muito';
}

/** How long ago the similar content went out decides how loud the warning is. Configurable. */
export interface SimilaritySettings {
  /** Warn from this percentage up. */
  threshold: number;
  /** Up to these many days: high, medium, low alert. */
  highDays: number;
  mediumDays: number;
  lowDays: number;
  /** From these many days on, an old content is a recycling candidate rather than a repeat. */
  recyclableDays: number;
}

export const DEFAULT_SIMILARITY_SETTINGS: SimilaritySettings = { threshold: 60, highDays: 7, mediumDays: 30, lowDays: 90, recyclableDays: 120 };

export function sanitizeSimilaritySettings(raw: Partial<Record<keyof SimilaritySettings, unknown>> | null | undefined): SimilaritySettings {
  const pick = (key: keyof SimilaritySettings, min: number, max: number) => {
    const value = raw?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : DEFAULT_SIMILARITY_SETTINGS[key];
  };
  const threshold = pick('threshold', 20, 95);
  const highDays = pick('highDays', 1, 60);
  const mediumDays = Math.max(highDays + 1, pick('mediumDays', 2, 180));
  const lowDays = Math.max(mediumDays + 1, pick('lowDays', 3, 365));
  const recyclableDays = Math.max(lowDays, pick('recyclableDays', 7, 730));
  return { threshold, highDays, mediumDays, lowDays, recyclableDays };
}

export type AlertLevel = 'alto' | 'medio' | 'baixo' | 'reciclavel';
export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = { alto: 'Alerta alto', medio: 'Alerta médio', baixo: 'Alerta baixo', reciclavel: 'Reciclável' };

export function alertLevel(ageDays: number | null, settings: SimilaritySettings): AlertLevel {
  if (ageDays === null) return 'medio';
  const age = Math.abs(ageDays);
  if (age <= settings.highDays) return 'alto';
  if (age <= settings.mediumDays) return 'medio';
  if (age < settings.recyclableDays) return 'baixo';
  return 'reciclavel';
}

export type MatchKind = 'repeticao' | 'variacao';
export const MATCH_KIND_LABELS: Record<MatchKind, string> = { repeticao: 'Conteúdo repetido', variacao: 'Possível variação de um padrão vencedor' };

export interface SimilarityMatch {
  other: ComparableContent;
  score: number;
  breakdown: SimilarityBreakdown;
  kind: MatchKind;
  ageDays: number | null;
  level: AlertLevel;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);

/**
 * A variation keeps the mechanism of a winner with new words: made from it, or same theme/structure
 * with clearly different copy. A repeat says the same thing again.
 */
function kindOf(candidate: ComparableContent, other: ComparableContent, breakdown: SimilarityBreakdown): MatchKind {
  if (candidate.originId && (candidate.originId === other.id || candidate.originId === other.originId)) return 'variacao';
  const sameMechanism = breakdown.theme >= 0.5 || breakdown.structure >= 0.6;
  return other.winning && sameMechanism && breakdown.idea < 0.35 && breakdown.hook < 0.6 ? 'variacao' : 'repeticao';
}

/** Contents of the same account at least `threshold`% alike, closest first. */
export function findSimilar(candidate: ComparableContent, pool: ComparableContent[], today: string, settings: SimilaritySettings): SimilarityMatch[] {
  return pool
    .filter((other) => other.id !== candidate.id && other.accountId === candidate.accountId)
    .map((other) => {
      const { score, breakdown } = compareContents(candidate, other);
      const reference = candidate.day ?? today;
      const ageDays = other.day ? daysBetween(other.day, reference) : null;
      return { other, score, breakdown, kind: kindOf(candidate, other, breakdown), ageDays, level: alertLevel(ageDays, settings) };
    })
    .filter((match) => match.score >= settings.threshold)
    .sort((a, b) => b.score - a.score);
}

/** "há 6 dias", "daqui a 2 dias", "hoje". */
export function ageLabel(ageDays: number | null): string {
  if (ageDays === null) return 'sem data';
  if (ageDays === 0) return 'hoje';
  if (ageDays < 0) return `daqui a ${-ageDays} ${ageDays === -1 ? 'dia' : 'dias'}`;
  return `há ${ageDays} ${ageDays === 1 ? 'dia' : 'dias'}`;
}
