import { OBJECTIVE_LABELS, type Objective } from '../content';
import { PLATFORM_LABELS, type CarouselFormat, type Platform } from '../carousel';
import type { GroupComparison } from '../intelligence/intelligence';

/**
 * A batch of new contents for a project, written from a briefing (by Claude, or by any chat with the prompt).
 * The answer comes back in the script format the create screen reads, so the Fábrica's own generator makes
 * the visual pieces with the photos and identity it already has.
 */

export const BATCH_COUNTS = [3, 5, 10] as const;
export type BatchCount = (typeof BATCH_COUNTS)[number];

export interface BatchRequest {
  project: { name: string; description: string; landingUrl: string; conversionGoal: string };
  objective: Objective;
  platforms: Platform[];
  count: BatchCount;
  tone: string;
  format: CarouselFormat;
  slides: number;
  /** Optional direction: themes, pains, an offer. */
  direction: string;
}

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10;

/**
 * Only patterns with enough contents (3+) become guidance, said as "worked better here", never as a rule.
 * Small samples stay out so a lucky post does not steer a whole batch.
 */
export function learningsFrom(groups: { title: string; rows: GroupComparison[] }[]): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    const solid = group.rows.filter((row) => !row.small && row.engagement !== null);
    if (solid.length < 2) continue;
    const best = solid[0];
    lines.push(`${group.title}: "${best.label}" teve o maior engajamento (${((best.engagement as number) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em ${best.contents} conteúdos).`);
  }
  return lines;
}

export function batchProblem(request: BatchRequest): string | null {
  if (!request.project.name) return 'Escolhe o projeto.';
  if (request.platforms.length === 0) return 'Escolhe pelo menos uma rede.';
  if (request.slides < MIN_SLIDES || request.slides > MAX_SLIDES) return `Use de ${MIN_SLIDES} a ${MAX_SLIDES} slides.`;
  return null;
}

export function buildBatchPrompt(request: BatchRequest, learnings: string[]): string {
  const { project } = request;
  return [
    `Você é estrategista de conteúdo e copywriter da marca ${project.name}. Quero ${request.count} carrosséis novos, cada um com ideia própria.`,
    '',
    '## Marca',
    project.description ? `- O que é: ${project.description}` : null,
    project.landingUrl ? `- Landing page: ${project.landingUrl}` : null,
    `- Conversão que importa: ${project.conversionGoal}`,
    `- Tom de voz: ${request.tone || 'direto, conversado, primeira pessoa'}`,
    '',
    '## Pedido',
    `- Objetivo dos posts: ${OBJECTIVE_LABELS[request.objective]}`,
    `- Redes: ${request.platforms.map((platform) => PLATFORM_LABELS[platform]).join(' e ')} (proporção ${request.format})`,
    `- ${request.slides} slides por carrossel, contando o CTA no último.`,
    request.direction ? `- Direção: ${request.direction}` : null,
    '',
    ...(learnings.length ? ['## O que já funcionou nas nossas contas (dados reais, use como direção, não como regra)', ...learnings.map((line) => `- ${line}`), ''] : []),
    '## Regras',
    '- Cada carrossel: título curto, gancho forte no slide 1, desenvolvimento, CTA específico no último slide ligado à conversão da marca.',
    '- Não invente dados, números, estatísticas, depoimentos ou promessas de resultado.',
    '- Ganchos e abordagens diferentes entre os carrosséis (dor, lista, erro comum, história, contrarian...).',
    '- Português do Brasil, linguagem natural, sem travessão.',
    '',
    '## Formato da resposta (siga exatamente)',
    'CARROSSEL 1: <título>',
    'Slide 1, <texto do slide>',
    'Slide 2, <texto do slide>',
    '...',
    'Legenda: <legenda do post com o CTA>',
    '',
    'CARROSSEL 2: ...',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
