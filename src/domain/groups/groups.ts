import { addDays } from '../schedule';

/**
 * Assisted distribution in Facebook groups run by other people (mainly for Lumad). The Fábrica prepares a version
 * per group that respects its rules, a tracked link per group and a checklist; posting and reading results are
 * done by hand, because no official API publishes to or reads third-party groups.
 */

export const GROUP_POLICIES = ['allowed', 'ask_admin', 'specific_day', 'forbidden', 'unknown'] as const;
export type GroupPolicy = (typeof GROUP_POLICIES)[number];
export const GROUP_POLICY_LABELS: Record<GroupPolicy, string> = {
  allowed: 'Divulgação permitida',
  ask_admin: 'Pedir ao admin antes',
  specific_day: 'Só em dia/post específico',
  forbidden: 'Divulgação proibida',
  unknown: 'Regra não conferida',
};

export interface FacebookGroup {
  id: string;
  projectId: string | null;
  name: string;
  url: string;
  category: string;
  theme: string;
  /** The group's own rules about promotion, as written by its admins. */
  rules: string;
  policy: GroupPolicy;
  /** Links are removed by the admins: the version keeps the link out of the text. */
  linkInComments: boolean;
  /** Minimum days between two posts of ours in this group, so we never become repetitive. */
  minDaysBetween: number;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FacebookGroupInput = Omit<FacebookGroup, 'id' | 'createdAt' | 'updatedAt'>;

export const DISTRIBUTION_STATUSES = ['pending', 'published', 'not_allowed'] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];
export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = { pending: 'Pendente', published: 'Publicado', not_allowed: 'Não autorizado' };

export interface GroupDistribution {
  id: string;
  groupId: string;
  /** Carousel whose images go with the post, when there is one. */
  carouselId: string | null;
  title: string;
  /** The version written for this group. */
  text: string;
  /** First comment to post right after (the link, when the group wants links there). */
  comment: string;
  linkId: string | null;
  date: string | null;
  status: DistributionStatus;
  postUrl: string;
  publishedAt: string | null;
  /** Typed by hand: the group's metrics are not available to any API. */
  results: { reactions: number | null; comments: number | null };
  /** What people said, admins' answers, anything worth remembering. */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type GroupDistributionInput = Omit<GroupDistribution, 'id' | 'createdAt' | 'updatedAt'>;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

/** Only facebook.com group addresses: the "Abrir grupo" button never opens anything else. */
export function normalizeGroupUrl(raw: unknown): string {
  try {
    const url = new URL(text(raw, 300));
    const host = url.hostname.toLowerCase().replace(/^(m|web|www)\./, '');
    if (url.protocol !== 'https:' || host !== 'facebook.com' || !/^\/groups\/[\w.-]+/.test(url.pathname)) return '';
    return `https://www.facebook.com${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return '';
  }
}

export function emptyGroup(projectId: string | null): FacebookGroupInput {
  return { projectId, name: '', url: '', category: '', theme: '', rules: '', policy: 'unknown', linkInComments: false, minDaysBetween: 14, notes: '', archived: false };
}

export function sanitizeGroupInput(raw: Partial<FacebookGroupInput>): FacebookGroupInput {
  const days = typeof raw.minDaysBetween === 'number' && Number.isFinite(raw.minDaysBetween) ? Math.round(raw.minDaysBetween) : 14;
  return {
    projectId: typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null,
    name: text(raw.name, 120),
    url: normalizeGroupUrl(raw.url),
    category: text(raw.category, 60),
    theme: text(raw.theme, 120),
    rules: text(raw.rules, 2000),
    policy: GROUP_POLICIES.includes(raw.policy as GroupPolicy) ? (raw.policy as GroupPolicy) : 'unknown',
    linkInComments: Boolean(raw.linkInComments),
    minDaysBetween: Math.min(90, Math.max(1, days)),
    notes: text(raw.notes, 2000),
    archived: Boolean(raw.archived),
  };
}

export function sanitizeDistributionInput(raw: Partial<GroupDistributionInput>): GroupDistributionInput {
  return {
    groupId: typeof raw.groupId === 'string' ? raw.groupId : '',
    carouselId: typeof raw.carouselId === 'string' && raw.carouselId ? raw.carouselId : null,
    title: text(raw.title, 200),
    text: text(raw.text, 5000),
    comment: text(raw.comment, 1000),
    linkId: typeof raw.linkId === 'string' && raw.linkId ? raw.linkId : null,
    date: typeof raw.date === 'string' && DAY.test(raw.date) ? raw.date : null,
    status: DISTRIBUTION_STATUSES.includes(raw.status as DistributionStatus) ? (raw.status as DistributionStatus) : 'pending',
    postUrl: typeof raw.postUrl === 'string' && /^https:\/\/(www\.|m\.)?facebook\.com\//.test(raw.postUrl.trim()) ? raw.postUrl.trim().slice(0, 500) : '',
    publishedAt: typeof raw.publishedAt === 'string' && !Number.isNaN(Date.parse(raw.publishedAt)) ? raw.publishedAt : null,
    results: { reactions: count(raw.results?.reactions), comments: count(raw.results?.comments) },
    notes: text(raw.notes, 3000),
  };
}

export function validateGroup(input: FacebookGroupInput): string | null {
  if (!input.name) return 'Dá um nome ao grupo.';
  if (!input.url) return 'Cola o endereço do grupo (https://www.facebook.com/groups/...).';
  return null;
}

/** Last day we posted (or planned) in the group, to keep the distance its frequency asks for. */
export function lastPostDay(distributions: GroupDistribution[], groupId: string): string | null {
  const days = distributions.filter((item) => item.groupId === groupId && item.status !== 'not_allowed' && item.date).map((item) => item.date as string);
  return days.length ? days.sort().at(-1) ?? null : null;
}

/** Why a group should not get a post on that day, or null when it can. */
export function groupBlock(group: FacebookGroup, distributions: GroupDistribution[], day: string): string | null {
  if (group.policy === 'forbidden') return 'O grupo não permite divulgação.';
  const last = lastPostDay(distributions, group.id);
  if (last && addDays(last, group.minDaysBetween) > day) return `Último post em ${last.split('-').reverse().join('/')}: espere ${group.minDaysBetween} dias entre posts nesse grupo.`;
  return null;
}

/** Openers rotate between groups so the same text never lands in many groups at once. */
const OPENERS = [
  (theme: string) => (theme ? `Pra quem curte ${theme}:` : 'Queria dividir uma coisa com vocês:'),
  (theme: string) => (theme ? `Uma dica pra galera de ${theme}:` : 'Fica a dica pra quem está nessa:'),
  () => 'Talvez ajude alguém aqui:',
  (theme: string) => (theme ? `Falando de ${theme}, aprendi isso na prática:` : 'Aprendi isso na prática e quis compartilhar:'),
];

export interface VersionInput {
  base: string;
  group: FacebookGroup;
  index: number;
  link: string | null;
}

/**
 * The post adapted to one group: an opener in the group's theme, the base text, and the link placed the way the
 * group allows (in the text, in the comments, or left out until the admin agrees).
 */
export function groupVersion({ base, group, index, link }: VersionInput): string {
  const opener = OPENERS[index % OPENERS.length](group.theme.trim());
  const body = base.trim();
  let closing = '';
  if (link && (group.policy === 'allowed' || group.policy === 'specific_day') && !group.linkInComments) closing = `\n\nMais aqui: ${link}`;
  else if (link && group.linkInComments) closing = '\n\nDeixo o link nos comentários pra quem quiser.';
  else if (group.policy === 'ask_admin' || group.policy === 'unknown') closing = '\n\nSe fizer sentido pra alguém, me chama que eu explico.';
  return `${opener}\n\n${body}${closing}`.slice(0, 5000);
}

/** Text of the first comment when the group asks for links there. */
export function linkComment(link: string): string {
  return `Link: ${link}`;
}

export function scheduleDays(start: string, groups: number, perDay: number): string[] {
  return Array.from({ length: groups }, (_, index) => addDays(start, Math.floor(index / Math.max(1, perDay))));
}
