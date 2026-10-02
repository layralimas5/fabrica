import { PLATFORMS, normalizeTime, type Platform } from '../domain/carousel';
import { CONTENT_CATEGORIES, OBJECTIVES, type ContentCategory, type Objective } from '../domain/content';
import type { CalendarEntryInput } from '../domain/calendar/calendar';

/** "Gerar conteúdo agora" from the calendar: what the create screen receives already filled in. */
export interface CalendarPlan {
  accountId: string | null;
  platform: Platform;
  date: string;
  time: string | null;
  title: string;
  theme: string;
  category: ContentCategory;
  objective: Objective | null;
  experimentId: string | null;
  variant: string;
  /** Planned entry the new carousels replace, removed once they are created. */
  entryId: string | null;
}

export function planFromEntry(entry: CalendarEntryInput, entryId: string | null): CalendarPlan {
  return {
    accountId: entry.accountId,
    platform: entry.platform,
    date: entry.date,
    time: entry.time,
    title: entry.title,
    theme: entry.theme,
    category: entry.category,
    objective: entry.objective,
    experimentId: entry.experimentId,
    variant: entry.variant,
    entryId,
  };
}

/** Router state can be anything (a reload, an old link): only a complete plan is used. */
export function readPlan(state: unknown): CalendarPlan | null {
  if (!state || typeof state !== 'object' || !('plan' in state)) return null;
  const plan = (state as { plan: Partial<CalendarPlan> | null }).plan;
  if (!plan || typeof plan.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    accountId: typeof plan.accountId === 'string' ? plan.accountId : null,
    platform: PLATFORMS.includes(plan.platform as Platform) ? (plan.platform as Platform) : 'instagram',
    date: plan.date,
    time: normalizeTime(plan.time),
    title: text(plan.title),
    theme: text(plan.theme),
    category: CONTENT_CATEGORIES.includes(plan.category as ContentCategory) ? (plan.category as ContentCategory) : 'outros',
    objective: OBJECTIVES.includes(plan.objective as Objective) ? (plan.objective as Objective) : null,
    experimentId: typeof plan.experimentId === 'string' ? plan.experimentId : null,
    variant: text(plan.variant),
    entryId: typeof plan.entryId === 'string' ? plan.entryId : null,
  };
}
