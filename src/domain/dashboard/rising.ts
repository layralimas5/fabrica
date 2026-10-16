import { daysBetween, type Momentum } from '../analytics/growth';
import { addDays } from '../schedule';
import type { DashItem } from './items';

/**
 * "Em alta agora": who gained the most views in the last days, read from the daily readings of each post
 * (synced by the API or typed by hand). Same rules as the old Analytics growth, on the Painel's items.
 */

/** Below this share of new views over the total, the post has stopped moving. */
const STABLE_GAIN = 0.02;
/** The last stretch keeps at least this share of the earlier pace to count as still growing. */
const GROWING_PACE = 0.6;

interface Reading {
  day: string;
  views: number;
}

export interface RisingEntry {
  item: DashItem;
  from: string;
  to: string;
  gained: number;
  viewsPerDay: number;
  momentum: Momentum;
}

function readingsOf(item: DashItem): Reading[] {
  return item.history.flatMap((entry) => (entry.metrics.views === undefined ? [] : [{ day: entry.day, views: entry.metrics.views }]));
}

/** Whether the post is still gaining views: the last stretch against the pace before it. */
export function momentumOfReadings(readings: Reading[]): Momentum {
  if (readings.length < 3) return 'early';
  const [first, before, last] = [readings[0], readings[readings.length - 2], readings[readings.length - 1]];
  const lastGain = last.views - before.views;
  if (lastGain <= before.views * STABLE_GAIN) return 'stable';
  const lastPace = lastGain / Math.max(1, daysBetween(before.day, last.day));
  const earlierPace = (before.views - first.views) / Math.max(1, daysBetween(first.day, before.day));
  return lastPace >= earlierPace * GROWING_PACE ? 'growing' : 'slowing';
}

/**
 * From the last reading before the window (or the posting day, counting from zero, for a post published inside
 * it) to the latest reading. Posts not read inside the window or that gained nothing stay out.
 */
export function risingPosts(items: DashItem[], today: string, windowDays = 7): RisingEntry[] {
  const start = addDays(today, -windowDays);
  const entries: RisingEntry[] = [];
  for (const item of items) {
    const readings = readingsOf(item);
    const latest = readings[readings.length - 1];
    if (!latest || latest.day < start) continue;
    const before = [...readings].reverse().find((reading) => reading.day <= start);
    const postedInWindow = item.publishedDay !== null && item.publishedDay >= start;
    const baseline = before ?? (postedInWindow ? { day: item.publishedDay as string, views: 0 } : readings[0]);
    const gained = latest.views - baseline.views;
    if (baseline === latest || gained <= 0) continue;
    const days = Math.max(1, daysBetween(baseline.day, latest.day));
    entries.push({ item, from: baseline.day, to: latest.day, gained, viewsPerDay: gained / days, momentum: momentumOfReadings(readings) });
  }
  return entries.sort((a, b) => b.gained - a.gained);
}
