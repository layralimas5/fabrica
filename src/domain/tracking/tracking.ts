
/**
 * Conversion tracking of our own landing pages and apps. Keep event names in sync with
 * supabase/functions/_shared/tracking/ingest.ts and the snippet public/t.js.
 */

export const TRACKING_EVENTS = ['click', 'lp_view', 'quiz_start', 'quiz_complete', 'signup', 'trial_start', 'subscription'] as const;
export type TrackingEventName = (typeof TRACKING_EVENTS)[number];
export const TRACKING_EVENT_LABELS: Record<TrackingEventName, string> = {
  click: 'Clique no link',
  lp_view: 'Visita à landing page',
  quiz_start: 'Início do quiz',
  quiz_complete: 'Conclusão do quiz',
  signup: 'Cadastro',
  trial_start: 'Início de teste grátis',
  subscription: 'Assinatura',
};

/** Where the visitor came from, as known when the event happened. */
export interface Touch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  /** Slug of the Fábrica's tracked link, when the visit started from one. */
  link: string | null;
  at: string | null;
}

export interface TrackingEvent {
  id: number;
  projectId: string;
  name: TrackingEventName;
  linkId: string | null;
  visitorId: string | null;
  verified: boolean;
  firstTouch: Touch | null;
  lastTouch: Touch | null;
  occurredAt: string;
}

export interface TrackingLink {
  id: string;
  projectId: string;
  slug: string;
  destination: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'outros' | null;
  carouselId: string | null;
  recordId: string | null;
  publicationId: string | null;
  label: string;
  utm: Utm;
  /** Facebook group the link was made for (distribution in groups). */
  groupId: string | null;
  createdAt: string;
}

export type TrackingLinkInput = Omit<TrackingLink, 'id' | 'createdAt'>;

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}

const SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

/** 8 characters without look-alikes (no l/1/0/o): short enough to type, ~10^12 combinations. */
export function newSlug(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join('');
}

/** "Pare de recomeçar toda Segunda!" → "pare-de-recomecar-toda-segunda" (UTM values travel in URLs and reports). */
export function utmValue(raw: string, max = 60): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** Default UTM of a link: the network as source, organic social as medium, the project as campaign, the content as content. */
export function defaultUtm(input: { platform: TrackingLink['platform']; project: string; content: string; campaign?: string; groupName?: string }): Utm {
  const source = input.groupName ? 'facebook_groups' : input.platform && input.platform !== 'outros' ? input.platform : 'outros';
  return {
    source,
    medium: input.groupName ? 'community' : 'organic_social',
    campaign: utmValue(input.campaign || input.project) || 'geral',
    content: utmValue(input.content) || 'conteudo',
    term: input.groupName ? utmValue(input.groupName) : '',
  };
}

export function sanitizeUtm(raw: Partial<Utm>): Utm {
  return {
    source: utmValue(raw.source ?? '') || 'outros',
    medium: utmValue(raw.medium ?? '') || 'organic_social',
    campaign: utmValue(raw.campaign ?? '') || 'geral',
    content: utmValue(raw.content ?? '', 80),
    term: utmValue(raw.term ?? '', 80),
  };
}

/** The landing page URL with the UTM and the link id, so the snippet knows which link brought the visit. */
export function trackedDestination(destination: string, utm: Utm, slug: string): string {
  const url = new URL(destination);
  const params: [string, string][] = [
    ['utm_source', utm.source],
    ['utm_medium', utm.medium],
    ['utm_campaign', utm.campaign],
    ['utm_content', utm.content],
    ['utm_term', utm.term],
    ['fab_l', slug],
  ];
  for (const [key, value] of params) if (value) url.searchParams.set(key, value);
  return url.toString();
}

/** Short link that records the click on the server before sending to the landing page. */
export function shortLink(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/l/${slug}`;
}

export function validateDestination(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Every stage of the funnel, in order. The first one is not an event: it is the views of the contents. */
export const FUNNEL_STAGES = ['views', 'click', 'lp_view', 'quiz_start', 'quiz_complete', 'signup', 'subscription'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  views: 'Visualizações dos conteúdos',
  click: 'Cliques nos links',
  lp_view: 'Visitas à landing page',
  quiz_start: 'Início do quiz',
  quiz_complete: 'Quiz concluído',
  signup: 'Cadastros',
  subscription: 'Assinaturas',
};

export interface FunnelStep {
  stage: FunnelStage;
  /** Null when nothing measures this stage (e.g. the project has no quiz or no links). */
  value: number | null;
  /** Share of the previous measured stage that reached this one. */
  fromPrevious: number | null;
  /** The measured stage it is compared with. */
  previousStage: FunnelStage | null;
}

/**
 * People per stage: events of a visitor count once per stage; events without a visitor id (before consent,
 * or clicks, which happen before the visitor exists) count one each.
 */
export function countStage(events: TrackingEvent[], name: TrackingEventName): number {
  const visitors = new Set<string>();
  let anonymous = 0;
  for (const event of events) {
    if (event.name !== name) continue;
    if (event.visitorId) visitors.add(event.visitorId);
    else anonymous += 1;
  }
  return visitors.size + anonymous;
}

export function buildFunnel(events: TrackingEvent[], views: number | null, measuredStages: Set<TrackingEventName>): FunnelStep[] {
  const steps: FunnelStep[] = [];
  let previous: { stage: FunnelStage; value: number } | null = null;
  for (const stage of FUNNEL_STAGES) {
    const value = stage === 'views' ? views : measuredStages.has(stage) ? countStage(events, stage) : null;
    const fromPrevious = value !== null && previous !== null && previous.value > 0 ? value / previous.value : null;
    steps.push({ stage, value, fromPrevious, previousStage: previous?.stage ?? null });
    if (value !== null) previous = { stage, value };
  }
  return steps;
}

/**
 * The step where the funnel loses the largest share of people. Views are exposures, not people, so the step
 * right after them (the click-through rate) is left out of this comparison.
 */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  const candidates = steps.filter((step) => step.fromPrevious !== null && step.stage !== 'views' && step.previousStage !== 'views');
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, step) => ((step.fromPrevious as number) < (worst.fromPrevious as number) ? step : worst));
}

/** A stage is measured when at least one event of it ever arrived for the project, or links exist (clicks). */
export function measuredStagesOf(allEvents: TrackingEvent[], hasLinks: boolean): Set<TrackingEventName> {
  const stages = new Set<TrackingEventName>(allEvents.map((event) => event.name));
  if (hasLinks) stages.add('click');
  return stages;
}

export type AttributionModel = 'last' | 'first';
export const ATTRIBUTION_LABELS: Record<AttributionModel, string> = { last: 'Última origem conhecida', first: 'Origem inicial' };

/** The tracked link an event is attributed to: the clicked link for clicks, the first or last touch otherwise. */
export function attributedLinkSlug(event: TrackingEvent, model: AttributionModel, slugById: Map<string, string>): string | null {
  if (event.linkId) return slugById.get(event.linkId) ?? null;
  const touch = model === 'first' ? (event.firstTouch ?? event.lastTouch) : (event.lastTouch ?? event.firstTouch);
  return touch?.link ?? null;
}

export interface LinkResult {
  link: TrackingLink;
  counts: Record<TrackingEventName, number>;
}

/** Events per tracked link under one attribution model. */
export function resultsByLink(events: TrackingEvent[], links: TrackingLink[], model: AttributionModel): LinkResult[] {
  const slugById = new Map(links.map((link) => [link.id, link.slug]));
  const grouped = new Map<string, TrackingEvent[]>();
  for (const event of events) {
    const slug = attributedLinkSlug(event, model, slugById);
    if (slug) grouped.set(slug, [...(grouped.get(slug) ?? []), event]);
  }
  return links.map((link) => {
    const list = grouped.get(link.slug) ?? [];
    const counts = Object.fromEntries(TRACKING_EVENTS.map((name) => [name, countStage(list, name)])) as Record<TrackingEventName, number>;
    return { link, counts };
  });
}

/** Events of the links made for one content (carousel, registered content or post). */
export function linksOfContent(links: TrackingLink[], content: { carouselId: string | null; recordId: string | null; publicationId: string | null }): TrackingLink[] {
  return links.filter(
    (link) =>
      (content.carouselId && link.carouselId === content.carouselId) ||
      (content.recordId && link.recordId === content.recordId) ||
      (content.publicationId && link.publicationId === content.publicationId),
  );
}

const SAO_PAULO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Day of an event in São Paulo time, the same day the Painel uses for posts. */
export function eventDay(iso: string): string {
  return SAO_PAULO_DAY.format(new Date(iso));
}

export function eventsInRange(events: TrackingEvent[], from: string, to: string): TrackingEvent[] {
  return events.filter((event) => {
    const day = eventDay(event.occurredAt);
    return day >= from && day <= to;
  });
}
export function sanitizeTouch(raw: unknown): Touch | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === 'string' && value[key] ? String(value[key]).slice(0, 120) : null);
  return { source: text('source'), medium: text('medium'), campaign: text('campaign'), content: text('content'), link: text('link'), at: text('at') };
}
