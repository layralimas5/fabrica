import { CTA_STYLE_LABELS, narrativeLabel, PRODUCT_PLACEMENT_LABELS, RHYTHM_LABELS, TEXT_DENSITY_LABELS, type ContentDna } from './dna';
import { CONTENT_FORMAT_LABELS, HOOK_TYPE_LABELS, type ContentRecord } from './record';

/**
 * Creating from a winner: reuse its mechanism, never its words.
 * The same request feeds Claude (when connected) or becomes a ready prompt to paste in any chat;
 * either way the answer comes back in the script format the create screen already reads.
 */

export const REMIX_MODES = ['model', 'variations', 'family'] as const;
export type RemixMode = (typeof REMIX_MODES)[number];
export const REMIX_MODE_LABELS: Record<RemixMode, string> = { model: 'Usar como modelo', variations: 'Criar variações', family: 'Família de conteúdos' };

export const VARIATION_COUNTS = [3, 5, 10] as const;
export type VariationCount = (typeof VARIATION_COUNTS)[number];

export const KEEP_OPTIONS = ['structure', 'rhythm', 'slideCount', 'copyStyle', 'hookType', 'visualIdentity'] as const;
export type KeepOption = (typeof KEEP_OPTIONS)[number];
export const KEEP_LABELS: Record<KeepOption, string> = {
  structure: 'Estrutura',
  rhythm: 'Ritmo',
  slideCount: 'Número de slides',
  copyStyle: 'Estilo de copy',
  hookType: 'Tipo de gancho',
  visualIdentity: 'Identidade visual',
};

export const VARY_OPTIONS = ['theme', 'hook', 'approach', 'pain', 'examples', 'cta', 'product'] as const;
export type VaryOption = (typeof VARY_OPTIONS)[number];
export const VARY_LABELS: Record<VaryOption, string> = {
  theme: 'Tema',
  hook: 'Gancho',
  approach: 'Abordagem',
  pain: 'Dor',
  examples: 'Exemplos',
  cta: 'CTA',
  product: 'Produto',
};

export const FAMILY_THEME_SUGGESTIONS = ['procrastinação', 'hábitos', 'metas', 'foco', 'organização', 'rotina', 'motivação', 'produtividade', 'constância', 'evolução'];

export const MAX_THEME_LENGTH = 60;
export const MAX_FAMILY_THEMES = 12;
export const MIN_FAMILY_THEMES = 2;

export interface RemixRequest {
  mode: RemixMode;
  /** Variations only. */
  count: VariationCount;
  keep: KeepOption[];
  vary: VaryOption[];
  /** Model: the new theme. Family: one theme per content. Variations: optional direction, usually empty. */
  themes: string[];
  /** Family only: name shown in the family tab. */
  familyName: string;
}

export interface RemixBrand {
  name: string;
  voice: string;
  product: { name: string; pitch: string } | null;
}

export function defaultRemixRequest(mode: RemixMode): RemixRequest {
  return {
    mode,
    count: 5,
    keep: [...KEEP_OPTIONS],
    vary: mode === 'variations' ? ['hook', 'approach', 'pain', 'examples'] : ['theme', 'hook', 'examples'],
    themes: [],
    familyName: '',
  };
}

export function cleanThemes(themes: string[]): string[] {
  const seen = new Set<string>();
  return themes
    .map((theme) => theme.trim().replace(/\s+/g, ' ').slice(0, MAX_THEME_LENGTH))
    .filter((theme) => {
      const key = theme.toLowerCase();
      if (!theme || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Null when the request can be sent, otherwise what is missing. */
export function remixProblem(request: RemixRequest): string | null {
  const themes = cleanThemes(request.themes);
  if (request.mode === 'model' && themes.length === 0) return 'Informe o novo tema.';
  if (request.mode === 'family' && themes.length < MIN_FAMILY_THEMES) return `Escolha pelo menos ${MIN_FAMILY_THEMES} temas pra família.`;
  if (request.mode === 'family' && themes.length > MAX_FAMILY_THEMES) return `No máximo ${MAX_FAMILY_THEMES} temas por família.`;
  if (request.mode === 'variations' && !VARIATION_COUNTS.includes(request.count)) return 'Escolha 3, 5 ou 10 variações.';
  return null;
}

export function remixCount(request: RemixRequest): number {
  if (request.mode === 'model') return 1;
  if (request.mode === 'family') return cleanThemes(request.themes).length;
  return request.count;
}

function dnaLines(record: ContentRecord, dna: ContentDna): string[] {
  return [
    `Tema original: ${record.theme || 'não informado'}`,
    `Formato: ${CONTENT_FORMAT_LABELS[record.format]} · ${dna.slideCount} ${record.format === 'carrossel' ? 'slides' : 'momentos'}`,
    `Gancho: ${HOOK_TYPE_LABELS[dna.hookType].toLowerCase()}`,
    `Emoção principal: ${dna.emotion}`,
    `Estrutura: ${narrativeLabel(dna)}`,
    `Quantidade de texto: ${TEXT_DENSITY_LABELS[dna.textDensity].toLowerCase()} (média de ${dna.avgWords} palavras por slide)`,
    `Ritmo: ${RHYTHM_LABELS[dna.rhythm].toLowerCase()}`,
    `Tom: ${dna.tone}`,
    `Estilo de copy: ${dna.copyStyle}`,
    `CTA: ${CTA_STYLE_LABELS[dna.cta].toLowerCase()}`,
    `Produto: ${PRODUCT_PLACEMENT_LABELS[dna.productPlacement].toLowerCase()}`,
    `Conclusão: ${dna.conclusion}`,
    `Mecanismo de retenção: ${dna.retention}`,
  ];
}

function keepLines(request: RemixRequest, dna: ContentDna): string[] {
  const lines: Partial<Record<KeepOption, string>> = {
    structure: 'Estrutura narrativa: a mesma sequência de funções, slide a slide, descrita acima.',
    rhythm: `Ritmo ${RHYTHM_LABELS[dna.rhythm].toLowerCase()}, com a mesma quantidade de texto por slide (cerca de ${dna.avgWords} palavras).`,
    slideCount: `Número de slides: exatamente ${dna.slideCount}.`,
    copyStyle: `Estilo de copy e tom: ${dna.copyStyle.toLowerCase()}; ${dna.tone.toLowerCase()}.`,
    hookType: `Tipo de gancho: ${HOOK_TYPE_LABELS[dna.hookType].toLowerCase()} (frase nova, mesmo mecanismo).`,
  };
  return request.keep.flatMap((option) => (lines[option] ? [lines[option]] : []));
}

function varyLines(request: RemixRequest, dna: ContentDna, hasProduct: boolean): string[] {
  const lines: Record<VaryOption, string> = {
    theme: request.mode === 'variations' ? 'Tema: cada variação com um tema diferente, dentro do mesmo universo do original.' : 'Tema: o novo tema indicado no pedido.',
    hook: request.keep.includes('hookType') ? 'Gancho: frase de abertura nova em cada conteúdo.' : 'Gancho: frase nova e, se fizer sentido, outro tipo de gancho.',
    approach: 'Abordagem: um ângulo diferente em cada conteúdo (outra crença a quebrar, outro ponto de vista).',
    pain: 'Dor: explore uma dor diferente do mesmo público.',
    examples: 'Exemplos: situações e exemplos novos, nada repetido do original.',
    cta: `CTA: chamada final diferente, mantendo o estilo ${CTA_STYLE_LABELS[dna.cta].toLowerCase()}.`,
    product: 'Produto: varie como e em que momento o produto aparece.',
  };
  const result = request.vary.map((option) => lines[option]);
  if (!request.vary.includes('product') && hasProduct) {
    result.push(`Produto: ${PRODUCT_PLACEMENT_LABELS[dna.productPlacement].toLowerCase()}, na mesma posição do original.`);
  }
  return result;
}

function askLine(request: RemixRequest, record: ContentRecord): string {
  const themes = cleanThemes(request.themes);
  if (request.mode === 'model') return `Crie 1 conteúdo novo sobre o tema: "${themes[0]}". Reinterprete a ideia do zero para esse tema.`;
  if (request.mode === 'family') {
    return [`Crie uma família de ${themes.length} conteúdos, um para cada tema abaixo, todos com o mesmo mecanismo do vencedor:`, ...themes.map((theme, index) => `${index + 1}. ${theme}`)].join('\n');
  }
  const direction = themes[0] ? ` na direção: "${themes[0]}"` : request.vary.includes('theme') ? '' : ` sobre o mesmo tema (${record.theme || 'o do original'})`;
  return `Crie ${request.count} variações independentes${direction}. Cada uma precisa ter ideia própria, não pode ser a mesma frase reescrita.`;
}

/** The whole briefing, written so any model (Claude here or a chat outside) answers in the Fábrica script format. */
export function buildRemixPrompt(record: ContentRecord, dna: ContentDna, request: RemixRequest, brand: RemixBrand | null): string {
  const count = remixCount(request);
  const hasProduct = dna.productPlacement !== 'nao_aparece';
  const productName = brand?.product?.name ?? 'o produto';
  const notCarousel = record.format !== 'carrossel';
  const original = record.script.map((beat, index) => `Slide ${index + 1}: ${beat.text.replace(/\n+/g, ' // ')}`);

  return [
    `Você é estrategista de conteúdo e copywriter. Abaixo está o DNA estrutural de um conteúdo que performou muito bem. Quero ${count === 1 ? '1 conteúdo novo' : `${count} conteúdos novos`} que reaproveitem o mecanismo dele, não o texto.`,
    '',
    'Regra principal: não copie o conteúdo vencedor. Copie o mecanismo que fez ele funcionar.',
    '- Não reaproveite frases, expressões marcantes nem exemplos do original.',
    '- Não troque só algumas palavras: reinterprete a ideia do zero.',
    '- Cada conteúdo precisa funcionar sozinho, com ideia própria.',
    '- Não invente dados, números, estatísticas, promessas ou depoimentos.',
    '- Português do Brasil, linguagem natural, sem travessão.',
    '',
    '## DNA do vencedor',
    ...dnaLines(record, dna),
    '',
    'Estrutura slide a slide:',
    ...dna.beats.map((beat, index) => `Slide ${index + 1}: ${beat.purpose} (cerca de ${beat.words} palavras)`),
    ...(original.length ? ['', '## Original (só referência de ritmo e formato, não reutilize o texto)', ...original] : []),
    '',
    '## O que manter',
    ...withFallback(keepLines(request, dna), 'Só o mecanismo de gancho e retenção descrito no DNA.').map((line) => `- ${line}`),
    '',
    '## O que variar',
    ...withFallback(varyLines(request, dna, hasProduct), 'O texto inteiro: frases e exemplos novos.').map((line) => `- ${line}`),
    ...(brand ? ['', '## Marca', `Nome: ${brand.name}`, ...(brand.voice ? [`Tom de voz: ${brand.voice}`] : []), ...(brand.product && hasProduct ? [`Produto: ${brand.product.name}. ${brand.product.pitch}`] : [])] : []),
    '',
    '## Pedido',
    askLine(request, record),
    ...(notCarousel ? ['O original é um vídeo: transforme cada momento do roteiro em um slide de carrossel.'] : []),
    '',
    '## Formato da resposta',
    `Responda só com ${count === 1 ? 'o carrossel' : 'os carrosséis'}, neste formato exato, sem comentários antes ou depois:`,
    '',
    'CARROSSEL 1: título curto',
    'Slide 1, texto do slide',
    'Slide 2, texto do slide',
    ...(hasProduct ? [`Slide 3 — PRODUTO`, `texto do slide que mostra ${productName}`] : ['Slide 3, texto do slide']),
    'Legenda: legenda do post',
    '',
    'Use // para quebrar linha dentro do mesmo slide.',
  ].join('\n');
}

export interface RemixScript {
  title: string;
  slides: { text: string; product: boolean }[];
  caption: string;
}

/** Claude's structured answer as copy boxes for the create screen, one carousel per box. */
export function scriptsToCopies(scripts: RemixScript[]): string[] {
  return scripts
    .filter((script) => script.slides.some((slide) => slide.text.trim()))
    .map((script, index) =>
      [
        `CARROSSEL ${index + 1}: ${script.title.trim() || `Variação ${index + 1}`}`,
        ...script.slides
          .filter((slide) => slide.text.trim())
          .map((slide, position) => (slide.product ? `Slide ${position + 1} — PRODUTO\n${oneSlide(slide.text)}` : `Slide ${position + 1}, ${oneSlide(slide.text)}`)),
        ...(script.caption.trim() ? [`Legenda: ${script.caption.trim().replace(/\n+/g, ' ')}`] : []),
      ].join('\n'),
    );
}

const withFallback = (lines: string[], fallback: string) => (lines.length ? lines : [fallback]);

/** A slide must stay on one line of the script; its own line breaks become `//`. */
const oneSlide = (text: string) => text.trim().replace(/\s*\n+\s*/g, ' // ');
