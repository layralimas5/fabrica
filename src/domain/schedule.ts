/** Calendar days as 'YYYY-MM-DD' strings, compared and shifted without time zones getting in the way. */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Today in the user's own time zone. */
export function todayIso(now: Date = new Date()): IsoDate {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export interface SchedulePlan {
  startDate: IsoDate;
  perDay: number;
}

export const MAX_PER_DAY = 10;

/** Spreads `count` posts from startDate, `perDay` on each day: 5 posts, 2 per day → d, d, d+1, d+1, d+2. */
export function distributeDates(count: number, { startDate, perDay }: SchedulePlan): IsoDate[] {
  const daily = Math.min(MAX_PER_DAY, Math.max(1, Math.floor(perDay)));
  return Array.from({ length: count }, (_, index) => addDays(startDate, Math.floor(index / daily)));
}

const weekdayOf = (date: IsoDate) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * Hands the planned dates out so each posting time lands on a similar mix of weekdays: otherwise 08:00 could get
 * every Friday and 19:00 every Saturday, and the day would decide the test. Two posts never share the same day and
 * time while another day is free for it. The dates themselves stay the same, only who gets which one changes.
 */
export function spreadTimesOverWeekdays(dates: IsoDate[], times: (string | null)[]): IsoDate[] {
  const remaining = [...dates].sort();
  const weekdaysByTime = new Map<string, Map<number, number>>();
  const taken = new Set<string>();
  return times.map((time) => {
    if (remaining.length === 0) return dates[dates.length - 1];
    const key = time ?? '';
    const counts = weekdaysByTime.get(key) ?? new Map<number, number>();
    const score = (date: IsoDate) => [taken.has(`${date}|${key}`) ? 1 : 0, counts.get(weekdayOf(date)) ?? 0];
    let best = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const [clashA, usedA] = score(remaining[index]);
      const [clashB, usedB] = score(remaining[best]);
      if (clashA < clashB || (clashA === clashB && usedA < usedB)) best = index;
    }
    const [chosen] = remaining.splice(best, 1);
    counts.set(weekdayOf(chosen), (counts.get(weekdayOf(chosen)) ?? 0) + 1);
    weekdaysByTime.set(key, counts);
    taken.add(`${chosen}|${key}`);
    return chosen;
  });
}

/** "qui., 02/10" */
export function formatDay(date: IsoDate): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** How many posts land on each day, in order. */
export function countByDay(dates: IsoDate[]): { date: IsoDate; count: number }[] {
  const counts = new Map<IsoDate, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}
