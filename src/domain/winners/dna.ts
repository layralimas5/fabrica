import { wordCount } from '../text';
import { HOOK_TYPE_LABELS, type HookType, type ScriptBeat } from './record';

/**
 * The structural DNA of a piece of content: what made it work, separated from what it said.
 * Analysis is deterministic (no network, no invented facts) and every field can be edited by hand afterwards.
 */

export const TEXT_DENSITIES = ['baixa', 'media', 'alta'] as const;
export type TextDensity = (typeof TEXT_DENSITIES)[number];
export const TEXT_DENSITY_LABELS: Record<TextDensity, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

export const RHYTHMS = ['rapido', 'medio', 'lento'] as const;
export type Rhythm = (typeof RHYTHMS)[number];
export const RHYTHM_LABELS: Record<Rhythm, string> = { rapido: 'Rápido', medio: 'Médio', lento: 'Lento' };

export const CTA_STYLES = ['direto', 'indireto', 'sem_cta'] as const;
export type CtaStyle = (typeof CTA_STYLES)[number];
export const CTA_STYLE_LABELS: Record<CtaStyle, string> = { direto: 'Direto', indireto: 'Indireto', sem_cta: 'Sem CTA' };

export const PRODUCT_PLACEMENTS = ['nao_aparece', 'inicio', 'meio', 'final'] as const;
export type ProductPlacement = (typeof PRODUCT_PLACEMENTS)[number];
export const PRODUCT_PLACEMENT_LABELS: Record<ProductPlacement, string> = {
  nao_aparece: 'Não aparece',
  inicio: 'Aparece no início',
  meio: 'Aparece no meio',
  final: 'Aparece no final',
};

export interface DnaBeat {
  /** What this slide does in the narrative, e.g. "Explica por que acontece". */
  purpose: string;
  /** Short name used in the narrative chain, e.g. "explicação". */
  step: string;
  words: number;
}

export interface ContentDna {
  hookType: HookType;
  emotion: string;
  /** Chain of steps, e.g. ["problema", "quebra de crença", "explicação", "solução"]. */
  narrative: string[];
  slideCount: number;
  textDensity: TextDensity;
  avgWords: number;
  rhythm: Rhythm;
  cta: CtaStyle;
  productPlacement: ProductPlacement;
  tone: string;
  copyStyle: string;
  visualStyle: string | null;
  conclusion: string;
  retention: string;
  beats: DnaBeat[];
  /** 'edited' once the user changed something, so a new automatic analysis asks before overwriting. */
  source: 'auto' | 'edited';
  analyzedAt: string;
}

export interface DnaInput {
  beats: ScriptBeat[];
  caption?: string;
  /** Product name, to spot the product slide in scripts without a product role. */
  productName?: string | null;
  visualStyle?: string | null;
}

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const HOOK_RULES: [HookType, RegExp][] = [
  ['erro_comum', /\berr(o|os|ando|ado|ada)\b/],
  ['lista', /^(\d+|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+\p{L}/u],
  ['historia', /\b(quando eu|ha \d+ (anos|meses)|um dia eu|semana passada|ano passado|era uma vez|eu tinha \d+)/],
  ['antes_depois', /\bantes\b.*\bdepois\b|\b(antes|depois) de\b|\bcomo era\b/],
  ['alerta', /^(cuidado|atencao|alerta|nao faca|evite|se voce .* pare)/],
  ['confronto', /^(voce nao|vc nao|para de|pare de|chega de|o problema nao e|sua? \p{L}+ nao (e|esta)|nao e falta de)/u],
  ['curiosidade', /(ninguem (te )?(conta|fala)|o que ninguem|o segredo|o motivo|descobri|isso muda|repara|a verdade sobre)/],
  ['contrarian', /(todo mundo|mito|esqueca|nao e sobre|ao contrario|talvez voce nao|na verdade|parei de acreditar|nao precisa)/],
  ['dor', /(cansad|frustrad|ansios|culpa|nao aguenta|nao consegue|travad|esgotad|sobrecarregad|sozinh)/],
  ['identificacao', /(se voce|voce tambem|quem nunca|pra quem|voce que|voce ja|todo dia voce)/],
  ['opiniao_forte', /(eu acho|na minha opiniao|sinceramente|a verdade e|opiniao impopular)/],
  ['promessa', /(^como |jeito de|metodo|em \d+ (dias|minutos|passos)|vai mudar|aprenda|o caminho)/],
];

export function classifyHook(hook: string): HookType {
  const text = fold(hook);
  for (const [type, pattern] of HOOK_RULES) if (pattern.test(text)) return type;
  if (text.endsWith('?')) return 'pergunta';
  if (/^eu\b|^confesso|^admito|^vou ser sincer/.test(text)) return 'confissao';
  if (/\bvoce\b/.test(text)) return 'identificacao';
  return 'curiosidade';
}

const HOOK_EMOTION: Record<HookType, string> = {
  curiosidade: 'curiosidade',
  confronto: 'identificação + desconforto',
  identificacao: 'identificação',
  dor: 'dor + identificação',
  promessa: 'desejo + esperança',
  erro_comum: 'medo de errar + curiosidade',
  opiniao_forte: 'provocação',
  contrarian: 'curiosidade + surpresa',
  pergunta: 'curiosidade + reflexão',
  historia: 'conexão + empatia',
  antes_depois: 'esperança + desejo',
  lista: 'curiosidade + utilidade',
  alerta: 'urgência',
  confissao: 'vulnerabilidade + conexão',
};

const ROLE_BEATS: Partial<Record<NonNullable<ScriptBeat['role']>, [string, string]>> = {
  context: ['Contextualiza', 'contexto'],
  situation: ['Descreve a situação', 'situação'],
  identification: ['Aprofunda a identificação', 'identificação'],
  problem: ['Apresenta o problema real', 'problema'],
  consequence: ['Mostra a consequência', 'consequência'],
  step: ['Passo prático', 'passos'],
  mistake: ['Aponta um erro', 'erros'],
  belief: ['Expõe a crença comum', 'crença'],
  argument: ['Argumenta', 'argumento'],
  example: ['Dá um exemplo', 'exemplo'],
  story: ['Conta a história', 'história'],
  insight: ['Mostra a nova perspectiva', 'nova perspectiva'],
  solution: ['Apresenta a solução', 'solução'],
  product: ['Mostra o produto', 'produto'],
  summary: ['Resume', 'resumo'],
  conclusion: ['Conclusão', 'conclusão'],
  cta: ['Chamada para ação', 'CTA'],
};

const DIRECT_CTA = /(link na bio|link|clica|clique|baixa|baixe|assine|assina|teste gratis|compra|garanta|cadastr|comenta .* (que eu|e eu) te mando)/;
const INDIRECT_CTA = /(salva|manda (pra|isso)|compartilha|comenta|me conta|me fala|segue|siga|qual (e|dessas|desses)|marca (alguem|quem))/;
const BELIEF_SHIFT = /^(mas|so que|na verdade|a verdade|o problema nao|nao e (sobre|falta)|e nao)\b|\bna verdade\b/;
const WHY = /\b(porque|por que|o motivo|a razao|acontece que|isso acontece)\b/;
const ACTION = /^(comece|comeca|faca|faz|tente|tenta|use|usa|experimente|escolha|troque|troca|defina|anote|anota|separe|corte|foque|pare de|para de|crie|cria)\b/;
const PERSPECTIVE = /^(e se|imagina|talvez|hoje eu|percebi|entendi|aprendi|descobri)\b/;
const SECOND_PERSON = /\b(voce|vc|seu|sua|seus|suas|te)\b/;
const FIRST_PERSON = /\b(eu|meu|minha|me|comigo)\b/;
const LIST_ITEM = /^(\d+[.)-]|primeiro|segundo|terceiro|quarto|quinto)\b/;

function textBeat(text: string, index: number, total: number, isProduct: boolean): [string, string] {
  const folded = fold(text);
  if (isProduct) return ['Mostra o produto', 'produto'];
  if (index === total - 1) {
    if (DIRECT_CTA.test(folded) || INDIRECT_CTA.test(folded)) return ['Chamada para ação', 'CTA'];
    return ['Conclusão', 'conclusão'];
  }
  if (LIST_ITEM.test(folded)) return ['Item da lista', 'lista'];
  if (BELIEF_SHIFT.test(folded)) return ['Quebra a crença', 'quebra de crença'];
  if (WHY.test(folded)) return ['Explica por que acontece', 'explicação'];
  if (ACTION.test(folded)) return ['Apresenta a solução', 'solução'];
  if (PERSPECTIVE.test(folded)) return ['Mostra a nova perspectiva', 'nova perspectiva'];
  if (folded.endsWith('?')) return ['Faz uma pergunta', 'pergunta'];
  if (SECOND_PERSON.test(folded) && index <= total / 2) return ['Aprofunda a identificação', 'identificação'];
  return index < total / 2 ? ['Apresenta o problema real', 'problema'] : ['Desenvolve a ideia', 'desenvolvimento'];
}

function hookPurpose(type: HookType): string {
  if (type === 'confronto' || type === 'contrarian') return 'Gancho forte / quebra de crença';
  return `Gancho de ${HOOK_TYPE_LABELS[type].toLowerCase()}`;
}

const ratio = (count: number, total: number) => (total > 0 ? count / total : 0);

function compress(steps: string[]): string[] {
  return steps.filter((step, index) => step !== steps[index - 1]);
}

export function analyzeDna({ beats, caption = '', productName = null, visualStyle = null }: DnaInput): ContentDna | null {
  const clean = beats.map((beat) => ({ ...beat, text: beat.text.trim() })).filter((beat) => beat.text);
  if (clean.length === 0) return null;

  const total = clean.length;
  const hookType = classifyHook(clean[0].text);
  const product = productName ? fold(productName) : null;
  const isProduct = (beat: ScriptBeat) => beat.role === 'product' || (product !== null && product.length > 2 && fold(beat.text).includes(product));

  const analyzed: DnaBeat[] = clean.map((beat, index) => {
    const words = wordCount(beat.text);
    if (index === 0) return { purpose: hookPurpose(hookType), step: 'gancho', words };
    const byRole = beat.role && !isProduct(beat) ? ROLE_BEATS[beat.role] : undefined;
    const [purpose, step] = byRole ?? textBeat(beat.text, index, total, isProduct(beat));
    return { purpose, step, words };
  });

  const avgWords = Math.round(analyzed.reduce((sum, beat) => sum + beat.words, 0) / total);
  const textDensity: TextDensity = avgWords <= 12 ? 'baixa' : avgWords <= 25 ? 'media' : 'alta';
  const rhythm: Rhythm = avgWords <= 10 || (total >= 8 && avgWords <= 14) ? 'rapido' : avgWords <= 20 ? 'medio' : 'lento';

  const last = fold(clean[total - 1].text);
  const foldedCaption = fold(caption);
  const cta: CtaStyle = DIRECT_CTA.test(last)
    ? 'direto'
    : INDIRECT_CTA.test(last) || INDIRECT_CTA.test(foldedCaption) || DIRECT_CTA.test(foldedCaption)
      ? 'indireto'
      : 'sem_cta';

  const productIndex = clean.findIndex(isProduct);
  const productPlacement: ProductPlacement =
    productIndex < 0 ? 'nao_aparece' : productIndex / total < 0.34 ? 'inicio' : productIndex / total < 0.67 ? 'meio' : 'final';

  const folded = clean.map((beat) => fold(beat.text));
  const youRatio = ratio(folded.filter((line) => SECOND_PERSON.test(line)).length, total);
  const meRatio = ratio(folded.filter((line) => FIRST_PERSON.test(line)).length, total);
  const questions = folded.filter((line) => line.includes('?')).length;
  const listLike = analyzed.filter((beat) => beat.step === 'lista' || beat.step === 'passos').length >= 2;

  const emotion = youRatio >= 0.4 && !HOOK_EMOTION[hookType].includes('identificação') ? `${HOOK_EMOTION[hookType]} + identificação` : HOOK_EMOTION[hookType];

  const conclusionBeat = analyzed[total - 1].step === 'CTA' && total > 1 ? folded[total - 2] : last;
  const conclusion = conclusionBeat.endsWith('?')
    ? 'Pergunta reflexiva'
    : ACTION.test(conclusionBeat)
      ? 'Convite à ação'
      : wordCount(conclusionBeat) <= 10
        ? 'Frase curta de impacto'
        : 'Fechamento reflexivo';

  const retention: string[] = [];
  if (['curiosidade', 'pergunta', 'contrarian', 'confronto', 'erro_comum'].includes(hookType)) retention.push('o gancho abre uma tensão que só fecha no fim');
  if (analyzed.slice(1, -1).some((beat) => beat.step === 'quebra de crença' || beat.step === 'nova perspectiva')) retention.push('virada de chave no meio');
  if (hookType === 'lista' || listLike) retention.push('contagem de itens puxa até o último');
  if (rhythm === 'rapido') retention.push('frases curtas fazem passar o slide sem esforço');
  if (productPlacement === 'final' || productPlacement === 'meio') retention.push('o produto só entra depois de entregar valor');
  if (retention.length === 0) retention.push('sequência lógica de ideias');

  return {
    hookType,
    emotion,
    narrative: compress(analyzed.map((beat) => beat.step)),
    slideCount: total,
    textDensity,
    avgWords,
    rhythm,
    cta,
    productPlacement,
    tone: toneOf(hookType, avgWords, meRatio, listLike),
    copyStyle: copyStyleOf(youRatio, meRatio, avgWords, questions, listLike),
    visualStyle,
    conclusion,
    retention: capitalize(retention.join('; ')),
    beats: analyzed,
    source: 'auto',
    analyzedAt: new Date().toISOString(),
  };
}

function toneOf(hookType: HookType, avgWords: number, meRatio: number, listLike: boolean): string {
  if (['confronto', 'contrarian', 'alerta', 'opiniao_forte'].includes(hookType)) return avgWords <= 14 ? 'Direto e provocativo' : 'Firme e argumentativo';
  if (['confissao', 'historia'].includes(hookType) || meRatio >= 0.4) return 'Pessoal e vulnerável';
  if (listLike || ['lista', 'promessa'].includes(hookType)) return 'Didático e prático';
  if (['dor', 'identificacao'].includes(hookType)) return 'Empático e próximo';
  return 'Direto e conversado';
}

function copyStyleOf(youRatio: number, meRatio: number, avgWords: number, questions: number, listLike: boolean): string {
  const parts = [
    meRatio > youRatio ? 'primeira pessoa (eu)' : youRatio > 0 ? 'fala direto com você' : 'impessoal',
    avgWords <= 12 ? 'frases curtas' : avgWords <= 25 ? 'frases médias' : 'blocos de texto',
  ];
  if (questions > 0) parts.push('com perguntas');
  if (listLike) parts.push('em lista');
  return capitalize(parts.join(', '));
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** "problema → quebra de crença → solução" */
export function narrativeLabel(dna: Pick<ContentDna, 'narrative'>): string {
  return dna.narrative.join(' → ');
}
