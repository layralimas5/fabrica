export const SLIDE_ROLES = [
  'hook',
  'context',
  'situation',
  'identification',
  'problem',
  'consequence',
  'point',
  'item',
  'step',
  'mistake',
  'belief',
  'argument',
  'example',
  'story',
  'insight',
  'solution',
  'product',
  'summary',
  'conclusion',
  'cta',
] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

export const CONTENT_TYPES = [
  'auto',
  'dor',
  'educativo',
  'lista',
  'tutorial',
  'storytelling',
  'contrarian',
  'erros',
  'framework',
  'manifesto',
  'transformacao',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  auto: 'Automático',
  dor: 'Dor / Identificação',
  educativo: 'Educativo',
  lista: 'Lista',
  tutorial: 'Tutorial',
  storytelling: 'Storytelling',
  contrarian: 'Contrarian',
  erros: 'Erros',
  framework: 'Framework',
  manifesto: 'Manifesto',
  transformacao: 'Transformação',
};

export const OBJECTIVES = ['engajamento', 'compartilhamento', 'salvamento', 'educacao', 'conversao', 'autoridade'] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  engajamento: 'Engajamento',
  compartilhamento: 'Compartilhamento',
  salvamento: 'Salvamento',
  educacao: 'Educação',
  conversao: 'Conversão',
  autoridade: 'Autoridade',
};

export const SLIDE_COUNT_OPTIONS = ['auto', 5, 7, 8, 10, 12] as const;
export type SlideCountOption = (typeof SLIDE_COUNT_OPTIONS)[number];

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 12;

/** Narrative skeletons. The AI may adapt them; the heuristic engine follows them literally. */
export const NARRATIVES: Record<Exclude<ContentType, 'auto'>, SlideRole[]> = {
  dor: ['hook', 'situation', 'identification', 'problem', 'consequence', 'insight', 'solution', 'cta'],
  educativo: ['hook', 'context', 'point', 'point', 'point', 'point', 'summary', 'cta'],
  lista: ['hook', 'item', 'item', 'item', 'item', 'item', 'insight', 'cta'],
  tutorial: ['problem', 'context', 'step', 'step', 'step', 'step', 'conclusion', 'cta'],
  storytelling: ['story', 'problem', 'mistake', 'consequence', 'insight', 'solution', 'conclusion', 'cta'],
  contrarian: ['belief', 'hook', 'argument', 'argument', 'example', 'conclusion', 'cta'],
  erros: ['hook', 'mistake', 'mistake', 'mistake', 'mistake', 'solution', 'conclusion', 'cta'],
  framework: ['hook', 'context', 'step', 'step', 'step', 'summary', 'cta'],
  manifesto: ['hook', 'belief', 'argument', 'argument', 'insight', 'conclusion', 'cta'],
  transformacao: ['hook', 'situation', 'consequence', 'insight', 'solution', 'conclusion', 'cta'],
};

/**
 * Where the product slide enters, so carousels don't all look alike:
 * pain themes show it near the end, method themes in the middle, transformation themes as visual proof.
 */
export type ProductPlacement = 'late' | 'middle' | 'proof';

export const PRODUCT_PLACEMENT: Record<Exclude<ContentType, 'auto'>, ProductPlacement> = {
  dor: 'late',
  educativo: 'middle',
  lista: 'middle',
  tutorial: 'middle',
  storytelling: 'late',
  contrarian: 'late',
  erros: 'late',
  framework: 'middle',
  manifesto: 'late',
  transformacao: 'proof',
};

/** Index (inside a role list without the CTA) where the product slide goes. */
export function productSlideIndex(roles: SlideRole[], placement: ProductPlacement): number {
  if (placement === 'middle') return Math.max(1, Math.ceil(roles.length / 2));
  const solution = roles.lastIndexOf('solution');
  if (solution > 0) return solution + 1;
  // Without a solution slide, the product sits right before the closing idea.
  return Math.max(1, roles.length - 1);
}

export const ROLE_LABELS: Record<SlideRole, string> = {
  hook: 'Gancho',
  context: 'Contexto',
  situation: 'Situação',
  identification: 'Identificação',
  problem: 'Problema',
  consequence: 'Consequência',
  point: 'Ponto',
  item: 'Item',
  step: 'Passo',
  mistake: 'Erro',
  belief: 'Crença',
  argument: 'Argumento',
  example: 'Exemplo',
  story: 'História',
  insight: 'Insight',
  solution: 'Solução',
  product: 'Produto',
  summary: 'Resumo',
  conclusion: 'Conclusão',
  cta: 'CTA',
};

export const CTA_BY_OBJECTIVE: Record<Objective, string> = {
  engajamento: 'Qual dessas é a sua? Me conta nos comentários.',
  compartilhamento: 'Manda pra alguém que precisa ler isso hoje.',
  salvamento: 'Salva pra voltar aqui quando precisar.',
  educacao: 'Segue pra aprender mais um pouco toda semana.',
  conversao: 'Quer colocar isso em prática? O link tá na bio.',
  autoridade: 'Segue pra mais conteúdo direto ao ponto.',
};

/** Readability limits enforced after any generation (AI or heuristic). */
export const TEXT_LIMITS = {
  hookWords: 14,
  titleWords: 16,
  bodyWords: 38,
  bullets: 5,
  bulletWords: 10,
} as const;

export function resolveSlideCount(option: SlideCountOption, available: number): number {
  const target = option === 'auto' ? available : option;
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, target));
}
