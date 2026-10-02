import { VISUAL_STYLE_LABELS, VISUAL_STYLES, type VisualStyle } from '../brandKit';
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, SLIDE_COUNT_OPTIONS, type ContentType, type SlideCountOption } from '../content';
import { exactSlides, GROUP_KEYS, groupStats, type ScoreOf } from '../winners/insights';
import type { ContentRecord } from '../winners/record';

/**
 * Content intelligence: what the numbers of an account say to make next, and how much to keep testing.
 * The goal is to scale winners without ever stopping new hypotheses.
 */

export const EXPLORATION_LEVELS = ['safe', 'balanced', 'experimental'] as const;
export type ExplorationLevel = (typeof EXPLORATION_LEVELS)[number];
export const EXPLORATION_INFO: Record<ExplorationLevel, { label: string; detail: string }> = {
  safe: { label: 'Seguro', detail: 'Todas as copys usam os padrões vencedores' },
  balanced: { label: 'Balanceado', detail: 'Metade com os vencedores, metade testando o que pouco foi usado' },
  experimental: { label: 'Experimental', detail: 'Tudo testando templates e tipos pouco usados' },
};

/** A pattern counts as a winner with at least 2 measured contents and an average above the account usual (50). */
export const MIN_PATTERN_SAMPLES = 2;
export const MIN_PATTERN_SCORE = 55;

export interface Pattern<T> {
  value: T;
  label: string;
  score: number;
  samples: number;
}

export interface Recommendations {
  template: Pattern<VisualStyle> | null;
  contentType: Pattern<Exclude<ContentType, 'auto'>> | null;
  slideCount: Pattern<number> | null;
  hooks: Pattern<string>[];
  themes: Pattern<string>[];
  /** Options this account barely used: what Experimental tries. */
  untestedTemplates: VisualStyle[];
  untestedTypes: Exclude<ContentType, 'auto'>[];
  /** Measured contents behind the recommendations. */
  measured: number;
}

function winners<T extends string>(records: ContentRecord[], keyOf: Parameters<typeof groupStats>[1], scoreOf: ScoreOf, parse: (key: string) => T | null): Pattern<T>[] {
  return groupStats(records, keyOf, 'score', scoreOf)
    .filter((stat) => stat.samples >= MIN_PATTERN_SAMPLES && stat.average >= MIN_PATTERN_SCORE)
    .flatMap((stat) => {
      const value = parse(stat.key);
      return value === null ? [] : [{ value, label: stat.label, score: Math.round(stat.average), samples: stat.samples }];
    });
}

const oneOf = <T extends string>(allowed: readonly T[]) => (key: string): T | null => (allowed.includes(key as T) ? (key as T) : null);
const PLATFORM_STYLES = VISUAL_STYLES;
const TYPES = CONTENT_TYPES.filter((type): type is Exclude<ContentType, 'auto'> => type !== 'auto');

/** Least used first, never-used before rarely-used. */
function leastUsed<T extends string>(options: readonly T[], used: (T | null)[]): T[] {
  const counts = new Map(options.map((option) => [option, 0]));
  for (const value of used) if (value && counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...options].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
}

/**
 * @param measured contents of the account with numbers (they set the winners)
 * @param all every content of the account, measured or not (they set what is untested)
 */
export function recommend(measured: ContentRecord[], all: ContentRecord[], scoreOf: ScoreOf): Recommendations {
  const slides = winners(measured, exactSlides, scoreOf, (key) => key);
  return {
    template: winners(measured, GROUP_KEYS.template, scoreOf, oneOf(PLATFORM_STYLES))[0] ?? null,
    contentType: winners(measured, GROUP_KEYS.contentType, scoreOf, oneOf(TYPES))[0] ?? null,
    slideCount: slides[0] ? { ...slides[0], value: Number(slides[0].value) } : null,
    hooks: winners(measured, GROUP_KEYS.hookType, scoreOf, (key) => key).slice(0, 3),
    themes: winners(measured, GROUP_KEYS.theme, scoreOf, (key) => key).slice(0, 3),
    untestedTemplates: leastUsed(PLATFORM_STYLES, all.map((record) => record.visualStyle)).slice(0, 3),
    untestedTypes: leastUsed(TYPES, all.map((record) => record.contentType)).slice(0, 3),
    measured: measured.length,
  };
}

export function hasRecommendations(recommendations: Recommendations): boolean {
  return Boolean(recommendations.template || recommendations.contentType || recommendations.slideCount || recommendations.hooks.length || recommendations.themes.length);
}

/** Choices for one copy box. Undefined keeps what the user chose on the screen. */
export interface CopyPlan {
  style?: VisualStyle;
  contentType?: Exclude<ContentType, 'auto'>;
  slideCount?: SlideCountOption;
  mode: 'winner' | 'explore';
}

/** Nearest slide-count option of the create screen. */
function slideOption(count: number): SlideCountOption {
  const numeric = SLIDE_COUNT_OPTIONS.filter((option): option is Exclude<SlideCountOption, 'auto'> => option !== 'auto');
  return numeric.reduce((best, option) => (Math.abs(option - count) < Math.abs(best - count) ? option : best));
}

/** One plan per copy box, following the exploration level. */
export function planCopies(count: number, level: ExplorationLevel, recommendations: Recommendations): CopyPlan[] {
  const winner: CopyPlan = {
    mode: 'winner',
    style: recommendations.template?.value,
    contentType: recommendations.contentType?.value,
    slideCount: recommendations.slideCount ? slideOption(recommendations.slideCount.value) : undefined,
  };
  let explored = 0;
  const explore = (): CopyPlan => {
    const plan: CopyPlan = {
      mode: 'explore',
      style: recommendations.untestedTemplates[explored % Math.max(1, recommendations.untestedTemplates.length)],
      contentType: recommendations.untestedTypes[explored % Math.max(1, recommendations.untestedTypes.length)],
    };
    explored += 1;
    return plan;
  };
  return Array.from({ length: count }, (_, index) => {
    if (level === 'safe') return winner;
    if (level === 'experimental') return explore();
    return index % 2 === 0 ? winner : explore();
  });
}

/** Briefing for the writing AI (Claude): what works for this account and how far to move away from it. */
export function guidanceFor(recommendations: Recommendations, plan: CopyPlan): string | null {
  if (plan.mode === 'explore') {
    return 'Este conteúdo é um teste: evite repetir os ganchos e temas mais usados da conta e experimente um ângulo novo.';
  }
  const lines = [
    recommendations.hooks.length ? `Ganchos que performam acima da média nessa conta: ${recommendations.hooks.map((hook) => hook.label.toLowerCase()).join(', ')}.` : null,
    recommendations.themes.length ? `Temas vencedores: ${recommendations.themes.map((theme) => theme.label).join(', ')}.` : null,
    recommendations.contentType ? `Estrutura vencedora: ${CONTENT_TYPE_LABELS[recommendations.contentType.value].toLowerCase()}.` : null,
    recommendations.slideCount ? `Quantidade de slides que performa melhor: ${recommendations.slideCount.value}.` : null,
  ].filter(Boolean);
  return lines.length ? `Dados do Analytics da conta (use como direção, sem copiar conteúdos anteriores): ${lines.join(' ')}` : null;
}

export function templateLabel(style: VisualStyle): string {
  return VISUAL_STYLE_LABELS[style];
}
