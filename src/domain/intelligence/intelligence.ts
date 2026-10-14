import { pooledEngagement, type DayRange } from '../dashboard/dashboard';
import { itemEngagement, type DashItem } from '../dashboard/items';
import { linksOfContent, resultsByLink, type AttributionModel, type TrackingEvent, type TrackingLink } from '../tracking/tracking';
import { HOOK_TYPE_LABELS } from '../winners/record';

/**
 * The Inteligência da Fábrica reads only real numbers: synced or typed results and tracked events.
 * Every finding says which numbers it comes from, and the suggestions are tests to run, never promises.
 */

export interface ContentResult {
  item: DashItem;
  engagement: number | null;
  /** Null when the content has no tracked link: without one, nothing can be credited to it. */
  clicks: number | null;
  visits: number | null;
  signups: number | null;
  hasLinks: boolean;
}

export function contentResults(items: DashItem[], links: TrackingLink[], events: TrackingEvent[], model: AttributionModel = 'last'): ContentResult[] {
  return items.map((item) => {
    const own = linksOfContent(links, item);
    if (own.length === 0) return { item, engagement: itemEngagement(item.metrics), clicks: null, visits: null, signups: null, hasLinks: false };
    const totals = resultsByLink(events, own, model).reduce(
      (sum, { counts }) => ({ clicks: sum.clicks + counts.click, visits: sum.visits + counts.lp_view, signups: sum.signups + counts.signup }),
      { clicks: 0, visits: 0, signups: 0 },
    );
    return { item, engagement: itemEngagement(item.metrics), ...totals, hasLinks: true };
  });
}

export type RankKey = 'engagement' | 'clicks' | 'signups';
/** Below this many views an engagement rate swings too much to rank. */
export const MIN_VIEWS = 100;

export function rankResults(results: ContentResult[], key: RankKey, limit = 5): ContentResult[] {
  const usable = results.filter((result) => {
    if (key === 'engagement') return result.engagement !== null && (result.item.metrics.views ?? 0) >= MIN_VIEWS;
    const value = result[key];
    return value !== null && value > 0;
  });
  const valueOf = (result: ContentResult) => (key === 'engagement' ? (result.engagement as number) : (result[key] as number));
  return usable.sort((a, b) => valueOf(b) - valueOf(a)).slice(0, limit);
}

export const COMPARE_KEYS = ['hookType', 'cta', 'theme', 'format'] as const;
export type CompareKey = (typeof COMPARE_KEYS)[number];
export const COMPARE_LABELS: Record<CompareKey, string> = { hookType: 'Tipos de gancho', cta: 'CTAs', theme: 'Assuntos', format: 'Formatos' };

/** Under this many contents a group is shown, but marked as a small sample. */
export const SMALL_SAMPLE = 3;

export interface GroupComparison {
  label: string;
  contents: number;
  views: number | null;
  engagement: number | null;
  /** Clicks per thousand views, only from contents that have tracked links. */
  clicksPerThousand: number | null;
  small: boolean;
}

function groupLabel(result: ContentResult, key: CompareKey): string | null {
  const { facts } = result.item;
  switch (key) {
    case 'hookType':
      return facts.hookType ? HOOK_TYPE_LABELS[facts.hookType] : null;
    case 'cta':
      return facts.cta ? facts.cta.replace(/\s+/g, ' ').slice(0, 60) : null;
    case 'theme':
      return facts.theme || null;
    case 'format':
      return result.item.formatLabel;
  }
}

export function compareGroups(results: ContentResult[], key: CompareKey): GroupComparison[] {
  const groups = new Map<string, ContentResult[]>();
  for (const result of results) {
    const label = groupLabel(result, key);
    if (label) groups.set(label, [...(groups.get(label) ?? []), result]);
  }
  return [...groups.entries()]
    .map(([label, list]) => {
      const withViews = list.filter((result) => result.item.metrics.views !== undefined);
      const views = withViews.length ? withViews.reduce((sum, result) => sum + (result.item.metrics.views ?? 0), 0) : null;
      const tracked = list.filter((result) => result.hasLinks && result.item.metrics.views);
      const trackedViews = tracked.reduce((sum, result) => sum + (result.item.metrics.views ?? 0), 0);
      return {
        label,
        contents: list.length,
        views,
        engagement: pooledEngagement(list.map((result) => result.item)).value,
        clicksPerThousand: trackedViews > 0 ? (tracked.reduce((sum, result) => sum + (result.clicks ?? 0), 0) / trackedViews) * 1000 : null,
        small: list.length < SMALL_SAMPLE,
      };
    })
    .sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1) || b.contents - a.contents);
}

export type FindingKind = 'views_no_link' | 'views_no_clicks' | 'clicks_no_visits' | 'visits_no_signups' | 'engages_low_reach';

export interface Finding {
  kind: FindingKind;
  result: ContentResult;
  title: string;
  /** The numbers behind the finding, exactly as measured. */
  evidence: string;
  /** What to try next. Hypotheses, so they are phrased as tests. */
  suggestions: string[];
}

const pt = (value: number) => value.toLocaleString('pt-BR');
const pct = (value: number) => `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(q * (sorted.length - 1))];
}

/** Views at or above this count as "many" for the project: its own top quarter, never less than 1.000. */
export const HIGH_VIEWS_FLOOR = 1000;
/** Clicks per view below this, with views that high, read as "views that did not turn into clicks". */
export const LOW_CLICK_RATE = 0.001;

export function findings(results: ContentResult[], hasVisitTracking: boolean, hasSignupTracking: boolean): Finding[] {
  const views = results.map((result) => result.item.metrics.views).filter((value): value is number => value !== undefined);
  const high = Math.max(HIGH_VIEWS_FLOOR, quantile(views, 0.75) ?? HIGH_VIEWS_FLOOR);
  const engagements = results.filter((result) => result.engagement !== null && (result.item.metrics.views ?? 0) >= MIN_VIEWS).map((result) => result.engagement as number);
  const topEngagement = quantile(engagements, 0.75);
  const medianViews = quantile(views, 0.5);
  const list: Finding[] = [];

  for (const result of results) {
    const itemViews = result.item.metrics.views;
    if (itemViews !== undefined && itemViews >= high) {
      if (!result.hasLinks) {
        list.push({
          kind: 'views_no_link',
          result,
          title: 'Muitas visualizações, sem link rastreável',
          evidence: `${pt(itemViews)} visualizações (entre as maiores do período) e nenhum link rastreável: não dá pra saber se trouxe alguém ao app.`,
          suggestions: ['Gerar um link rastreável pra esse conteúdo e usar no próximo post parecido.', 'Repetir o mesmo gancho com um CTA que leve ao link da bio rastreado.'],
        });
      } else if ((result.clicks ?? 0) / itemViews < LOW_CLICK_RATE) {
        list.push({
          kind: 'views_no_clicks',
          result,
          title: result.clicks ? 'Muitas visualizações, poucos cliques' : 'Muitas visualizações, nenhum clique rastreado',
          evidence: `${pt(itemViews)} visualizações e ${pt(result.clicks ?? 0)} cliques no link (${pct((result.clicks ?? 0) / itemViews)}). Os dados não dizem o motivo; abaixo, hipóteses pra testar.`,
          suggestions: [
            `CTA: trocar o pedido genérico por uma ação específica e um motivo (o CTA atual é "${result.item.facts.cta || 'não registrado'}").`,
            'Proposta de valor: dizer no último slide o que a pessoa ganha ao clicar, com as mesmas palavras do topo da landing page.',
            'Continuidade: a landing page precisa abrir com a mesma promessa do post, pra quem clica reconhecer que está no lugar certo.',
          ],
        });
      }
    }
    if (hasVisitTracking && result.clicks !== null && result.clicks >= 10 && result.visits !== null && result.visits / result.clicks < 0.5) {
      list.push({
        kind: 'clicks_no_visits',
        result,
        title: 'Cliques que não viram visita',
        evidence: `${pt(result.clicks)} cliques e ${pt(result.visits)} visitas registradas na landing page (${pct(result.visits / result.clicks)}).`,
        suggestions: ['Conferir se o snippet está na página de destino desse link.', 'Medir o tempo de carregamento da página no celular: quem desiste antes de abrir não vira visita.'],
      });
    }
    if (hasSignupTracking && result.visits !== null && result.visits >= 20 && result.signups === 0) {
      list.push({
        kind: 'visits_no_signups',
        result,
        title: 'Visitas sem cadastro',
        evidence: `${pt(result.visits)} visitas atribuídas e nenhum cadastro.`,
        suggestions: ['Comparar a promessa do post com a da landing page: quem chega desse conteúdo pode estar esperando outra coisa.', 'Testar um CTA na landing page que fale da dor que o post tratou.'],
      });
    }
    if (topEngagement !== null && medianViews !== null && result.engagement !== null && result.engagement >= topEngagement && itemViews !== undefined && itemViews >= MIN_VIEWS && itemViews < medianViews) {
      list.push({
        kind: 'engages_low_reach',
        result,
        title: 'Engaja muito, alcança pouco',
        evidence: `Taxa de engajamento de ${pct(result.engagement)} (entre as maiores) com ${pt(itemViews)} visualizações (abaixo da mediana de ${pt(medianViews)}).`,
        suggestions: ['Criar uma versão com outro gancho mantendo o mesmo miolo.', 'Repostar em outro horário ou formato e comparar.'],
      });
    }
  }
  return list;
}

export interface WeeklySummary {
  range: DayRange;
  posts: number;
  previousPosts: number;
  views: number | null;
  previousViews: number | null;
  engagement: number | null;
  clicks: number | null;
  signups: number | null;
  best: ContentResult | null;
  lines: string[];
}

/** Last 7 days against the 7 before, said in plain sentences that only repeat what was measured. */
export function weeklySummary(current: ContentResult[], previous: ContentResult[], range: DayRange, periodEvents: TrackingEvent[], tracked: { clicks: boolean; signups: boolean }): WeeklySummary {
  const sumViews = (list: ContentResult[]) => {
    const values = list.map((result) => result.item.metrics.views).filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const views = sumViews(current);
  const previousViews = sumViews(previous);
  const engagement = pooledEngagement(current.map((result) => result.item)).value;
  const clicks = tracked.clicks ? periodEvents.filter((event) => event.name === 'click').length : null;
  const signups = tracked.signups ? periodEvents.filter((event) => event.name === 'signup').length : null;
  const best = rankResults(current, 'engagement', 1)[0] ?? null;

  const lines: string[] = [];
  lines.push(`${current.length} ${current.length === 1 ? 'post publicado' : 'posts publicados'} (${previous.length} na semana anterior).`);
  if (views !== null) {
    const change = previousViews ? ` (${views >= previousViews ? '+' : '−'}${pct(Math.abs(views - previousViews) / previousViews)} contra a semana anterior)` : '';
    lines.push(`${pt(views)} visualizações nos posts da semana${change}.`);
  } else lines.push('Nenhum post da semana tem visualizações registradas ainda.');
  if (engagement !== null) lines.push(`Taxa de engajamento de ${pct(engagement)}.`);
  if (best) lines.push(`Melhor engajamento: “${best.item.title}” (${pct(best.engagement as number)}).`);
  if (clicks !== null) lines.push(`${pt(clicks)} cliques nos links rastreáveis.`);
  else lines.push('Cliques não medidos: nenhum link rastreável em uso.');
  if (signups !== null) lines.push(`${pt(signups)} cadastros registrados.`);
  return { range, posts: current.length, previousPosts: previous.length, views, previousViews, engagement, clicks, signups, best, lines };
}

/**
 * Briefing for Claude (or to paste in a chat in local mode): only the measured numbers, with the rule
 * that nothing outside them may be stated.
 */
export function analysisBriefing(project: string, summary: WeeklySummary, top: ContentResult[], found: Finding[], groups: { title: string; rows: GroupComparison[] }[]): string {
  const lines = [
    `Projeto: ${project}. Período: ${summary.range.from} a ${summary.range.to}.`,
    'Resumo medido:',
    ...summary.lines.map((line) => `- ${line}`),
    '',
    'Conteúdos com melhor engajamento (título | rede | formato | visualizações | engajamento | cliques | cadastros | gancho | CTA):',
    ...top.map(
      (result) =>
        `- ${result.item.title} | ${result.item.platform} | ${result.item.formatLabel} | ${result.item.metrics.views ?? 'sem dado'} | ${result.engagement !== null ? pct(result.engagement) : 'sem dado'} | ${result.clicks ?? 'sem link'} | ${result.signups ?? 'sem link'} | ${result.item.facts.hook || '-'} | ${result.item.facts.cta || '-'}`,
    ),
    '',
    'Achados por regra (com os números):',
    ...(found.length ? found.map((finding) => `- ${finding.title}: ${finding.evidence} (conteúdo: ${finding.result.item.title})`) : ['- nenhum']),
    '',
    ...groups.flatMap((group) => [
      `${group.title} (rótulo | conteúdos | engajamento | cliques por mil visualizações):`,
      ...group.rows.slice(0, 8).map((row) => `- ${row.label} | ${row.contents}${row.small ? ' (amostra pequena)' : ''} | ${row.engagement !== null ? pct(row.engagement) : 'sem dado'} | ${row.clicksPerThousand !== null ? row.clicksPerThousand.toFixed(2) : 'sem dado'}`),
    ]),
  ];
  return lines.join('\n').slice(0, 28000);
}
