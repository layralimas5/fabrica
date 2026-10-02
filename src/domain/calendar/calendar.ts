import { categoryOf, isPosted, normalizeTime, PLATFORMS, type Carousel, type Platform } from '../carousel';
import { CONTENT_CATEGORIES, CONTENT_CATEGORY_LABELS, OBJECTIVES, type ContentCategory, type Objective } from '../content';
import type { ContentRecord } from '../winners/record';

/**
 * Calendário Editorial: every planned and published content of every account on one timeline.
 * Fábrica carousels come with their schedule; anything else (videos, UGC, Reels, ideas not generated yet)
 * is a calendar entry.
 */

export const CALENDAR_KINDS = ['carrossel', 'video', 'ugc', 'reels', 'outros'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = { carrossel: 'Carrossel', video: 'Vídeo', ugc: 'UGC', reels: 'Reels', outros: 'Outros' };

export const CALENDAR_STATUSES = ['rascunho', 'em_producao', 'pronto', 'agendado', 'publicado'] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];
export const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  rascunho: 'Rascunho',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  agendado: 'Agendado',
  publicado: 'Publicado',
};

/** A planned content that is not (yet) a Fábrica carousel. */
export interface CalendarEntry {
  id: string;
  accountId: string | null;
  platform: Platform;
  kind: CalendarKind;
  title: string;
  theme: string;
  category: ContentCategory;
  objective: Objective | null;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' */
  time: string | null;
  status: CalendarStatus;
  experimentId: string | null;
  variant: string;
  notes: string;
  /** Results registered for it once published (a content record). */
  recordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEntryInput = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

export function emptyEntry(date: string, accountId: string | null, platform: Platform): CalendarEntryInput {
  return { accountId, platform, kind: 'carrossel', title: '', theme: '', category: 'outros', objective: null, date, time: null, status: 'rascunho', experimentId: null, variant: '', notes: '', recordId: null };
}

export function sanitizeEntryInput(raw: Partial<CalendarEntryInput>): CalendarEntryInput {
  return {
    accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null,
    platform: oneOf(PLATFORMS, raw.platform, 'instagram'),
    kind: oneOf(CALENDAR_KINDS, raw.kind, 'carrossel'),
    title: text(raw.title, 140),
    theme: text(raw.theme, 60),
    category: oneOf(CONTENT_CATEGORIES, raw.category, 'outros'),
    objective: OBJECTIVES.includes(raw.objective as Objective) ? (raw.objective as Objective) : null,
    date: typeof raw.date === 'string' && ISO_DAY.test(raw.date) ? raw.date : new Date().toISOString().slice(0, 10),
    time: normalizeTime(raw.time),
    status: oneOf(CALENDAR_STATUSES, raw.status, 'rascunho'),
    experimentId: typeof raw.experimentId === 'string' && raw.experimentId ? raw.experimentId : null,
    variant: text(raw.variant, 60),
    notes: text(raw.notes, 1000),
    recordId: typeof raw.recordId === 'string' && raw.recordId ? raw.recordId : null,
  };
}

export function toEntryInput(entry: CalendarEntry): CalendarEntryInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = entry;
  return input;
}

/** One card of the calendar, whatever it comes from. */
export interface CalendarItem {
  key: string;
  date: string;
  time: string | null;
  title: string;
  accountId: string | null;
  platform: Platform;
  kind: CalendarKind;
  category: ContentCategory;
  theme: string;
  status: CalendarStatus;
  experimentId: string | null;
  carousel: Carousel | null;
  entry: CalendarEntry | null;
}

/** Ready with a time set means it is scheduled for a moment; ready without one is just done. */
export function carouselCalendarStatus(carousel: Carousel): CalendarStatus {
  if (isPosted(carousel)) return 'publicado';
  if (carousel.status === 'draft') return 'rascunho';
  if (carousel.status === 'editing') return 'em_producao';
  return carousel.source.scheduledTime ? 'agendado' : 'pronto';
}

/** Carousels with a day (posted ones use their publication day) plus the entries. Archived ones stay out. */
export function calendarItems(carousels: Carousel[], entries: CalendarEntry[], records: ContentRecord[], platformOf: (accountId: string | null) => Platform | null): CalendarItem[] {
  const publishedDay = new Map(records.filter((record) => record.carouselId && record.publishedAt).map((record) => [record.carouselId as string, record.publishedAt as string]));
  const fromCarousels = carousels.flatMap((carousel): CalendarItem[] => {
    if (carousel.status === 'archived') return [];
    const date = carousel.scheduledFor ?? publishedDay.get(carousel.id) ?? null;
    if (!date) return [];
    return [
      {
        key: `c:${carousel.id}`,
        date,
        time: carousel.source.scheduledTime ?? null,
        title: carousel.slides[0]?.title.replace(/\n+/g, ' ') || carousel.title,
        accountId: carousel.source.accountId ?? null,
        platform: platformOf(carousel.source.accountId ?? null) ?? (carousel.format === '9:16' ? 'tiktok' : 'instagram'),
        kind: 'carrossel',
        category: categoryOf(carousel.source),
        theme: carousel.source.theme ?? '',
        status: carouselCalendarStatus(carousel),
        experimentId: carousel.experiment?.id ?? null,
        carousel,
        entry: null,
      },
    ];
  });
  const fromEntries = entries.map((entry): CalendarItem => ({
    key: `e:${entry.id}`,
    date: entry.date,
    time: entry.time,
    title: entry.title || entry.theme || CALENDAR_KIND_LABELS[entry.kind],
    accountId: entry.accountId,
    platform: entry.platform,
    kind: entry.kind,
    category: entry.category,
    theme: entry.theme,
    status: entry.status,
    experimentId: entry.experimentId,
    carousel: null,
    entry,
  }));
  return [...fromCarousels, ...fromEntries].sort(byMoment);
}

export function byMoment(a: Pick<CalendarItem, 'date' | 'time' | 'title'>, b: Pick<CalendarItem, 'date' | 'time' | 'title'>): number {
  return a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title);
}

export interface CalendarFilters {
  accountId: string | null;
  platform: Platform | 'all';
  status: CalendarStatus | 'all';
  kind: CalendarKind | 'all';
  category: ContentCategory | 'all';
}

export const EMPTY_CALENDAR_FILTERS: Omit<CalendarFilters, 'accountId'> = { platform: 'all', status: 'all', kind: 'all', category: 'all' };

export function filterCalendar(items: CalendarItem[], filters: CalendarFilters): CalendarItem[] {
  return items.filter(
    (item) =>
      (!filters.accountId || item.accountId === filters.accountId) &&
      (filters.platform === 'all' || item.platform === filters.platform) &&
      (filters.status === 'all' || item.status === filters.status) &&
      (filters.kind === 'all' || item.kind === filters.kind) &&
      (filters.category === 'all' || item.category === filters.category),
  );
}

// ---------- dates ----------

const toDate = (day: string) => new Date(`${day}T12:00:00`);
const toDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function addDays(day: string, amount: number): string {
  const date = toDate(day);
  date.setDate(date.getDate() + amount);
  return toDay(date);
}

/** Monday of the week of a day. */
export function weekStart(day: string): string {
  const weekday = (toDate(day).getDay() + 6) % 7;
  return addDays(day, -weekday);
}

export function weekDays(day: string): string[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Weeks (Monday to Sunday) covering the month of a day, padded with days of the neighbour months. */
export function monthGrid(day: string): string[][] {
  const first = `${day.slice(0, 8)}01`;
  const date = toDate(first);
  date.setMonth(date.getMonth() + 1, 0);
  const last = toDay(date);
  const weeks: string[][] = [];
  for (let cursor = weekStart(first); cursor <= last; cursor = addDays(cursor, 7)) weeks.push(weekDays(cursor));
  return weeks;
}

export function addMonths(day: string, amount: number): string {
  const date = toDate(`${day.slice(0, 8)}01`);
  date.setMonth(date.getMonth() + amount);
  return toDay(date);
}

// ---------- repetition and distribution ----------

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export interface RepetitionAlert {
  accountId: string | null;
  theme: string;
  count: number;
  from: string;
  to: string;
  /** Other themes the account already works with, to alternate. */
  suggestions: string[];
}

export const REPETITION_RUN = 3;

/** Three or more contents in a row about the same theme in the same account. Warns, never blocks. */
export function repetitionAlerts(items: CalendarItem[]): RepetitionAlert[] {
  const byAccount = new Map<string, CalendarItem[]>();
  for (const item of items) byAccount.set(item.accountId ?? '', [...(byAccount.get(item.accountId ?? '') ?? []), item]);
  const alerts: RepetitionAlert[] = [];
  for (const [account, list] of byAccount) {
    const ordered = [...list].sort(byMoment);
    const themes = [...new Set(ordered.map((item) => item.theme.trim()).filter(Boolean))];
    let run: CalendarItem[] = [];
    const close = () => {
      if (run.length >= REPETITION_RUN) {
        const theme = run[0].theme.trim();
        alerts.push({ accountId: account || null, theme, count: run.length, from: run[0].date, to: run[run.length - 1].date, suggestions: themes.filter((other) => fold(other) !== fold(theme)).slice(0, 3) });
      }
    };
    for (const item of ordered) {
      if (item.theme.trim() && run.length && fold(run[0].theme) === fold(item.theme)) run.push(item);
      else {
        close();
        run = item.theme.trim() ? [item] : [];
      }
    }
    close();
  }
  return alerts;
}

export function distribution(items: CalendarItem[]): { category: ContentCategory; label: string; count: number; share: number }[] {
  const counts = new Map<ContentCategory, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, label: CONTENT_CATEGORY_LABELS[category], count, share: items.length ? count / items.length : 0 }))
    .sort((a, b) => b.count - a.count);
}

export interface WeeklyPlan {
  goal: number;
  planned: number;
  published: number;
  remaining: number;
  experiments: number;
  activeAccounts: number;
  themes: { theme: string; count: number }[];
}

export function weeklyPlan(items: CalendarItem[], goal: number, activeAccounts: number): WeeklyPlan {
  const published = items.filter((item) => item.status === 'publicado').length;
  const themes = new Map<string, { theme: string; count: number }>();
  for (const item of items) {
    const theme = item.theme.trim();
    if (!theme) continue;
    const current = themes.get(fold(theme)) ?? { theme, count: 0 };
    current.count += 1;
    themes.set(fold(theme), current);
  }
  return {
    goal,
    planned: items.length,
    published,
    remaining: Math.max(0, goal - published),
    experiments: new Set(items.map((item) => item.experimentId).filter(Boolean)).size,
    activeAccounts,
    themes: [...themes.values()].sort((a, b) => b.count - a.count),
  };
}

export const DEFAULT_WEEKLY_GOAL = 21;

