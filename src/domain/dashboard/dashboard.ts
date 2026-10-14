import { addDays } from '../schedule';
import { sameProject } from '../project';
import type { AccountSnapshot, PostMetricKey } from '../social/metrics';
import { itemEngagement, type DashItem, type DashPlatform } from './items';

/**
 * The Painel's numbers, computed only from what exists. Every total says how many contents it covers,
 * every comparison needs a base in both periods, and a metric no content has stays null (shown as "indisponível").
 */

export const DASH_PERIODS = ['7', '30', '90', 'custom'] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number];
export const DASH_PERIOD_LABELS: Record<DashPeriod, string> = { '7': '7 dias', '30': '30 dias', '90': '90 dias', custom: 'Personalizado' };

export interface DashFilters {
  project: string | null;
  platform: DashPlatform | 'all';
  accountKey: string | null;
  period: DashPeriod;
  /** Used when period is custom ('YYYY-MM-DD'). */
  from: string;
  to: string;
}

export interface DayRange {
  from: string;
  to: string;
  days: number;
}

/** Inclusive range ending today, and the range of the same length right before it. */
export function dashRanges(filters: Pick<DashFilters, 'period' | 'from' | 'to'>, today: string): { current: DayRange; previous: DayRange } {
  let from: string;
  let to: string;
  if (filters.period === 'custom' && filters.from && filters.to && filters.from <= filters.to) {
    from = filters.from;
    to = filters.to;
  } else {
    const length = filters.period === 'custom' ? 30 : Number(filters.period);
    to = today;
    from = addDays(today, -(length - 1));
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { current: { from, to, days }, previous: { from: addDays(from, -days), to: addDays(from, -1), days } };
}

const inRange = (day: string | null, range: DayRange) => Boolean(day && day >= range.from && day <= range.to);

/** Project, platform and account filters (the period is applied by publication day afterwards). */
export function scopeItems(items: DashItem[], filters: Pick<DashFilters, 'project' | 'platform' | 'accountKey'>): DashItem[] {
  return items.filter(
    (item) =>
      (!filters.project || sameProject(item.project, filters.project)) &&
      (filters.platform === 'all' || item.platform === filters.platform) &&
      (!filters.accountKey || item.accountKey === filters.accountKey),
  );
}

export interface KpiValue {
  value: number | null;
  previous: number | null;
  /** (value - previous) / previous, only when both exist and previous > 0. */
  change: number | null;
  /** Contents that have this metric, out of the contents of the period. */
  covered: number;
  total: number;
}

export const DASH_KPI_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'] as const satisfies readonly PostMetricKey[];

function sumOf(items: DashItem[], key: PostMetricKey): { value: number | null; covered: number } {
  const values = items.map((item) => item.metrics[key]).filter((value): value is number => value !== undefined);
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, covered: values.length };
}

export function change(value: number | null, previous: number | null): number | null {
  return value !== null && previous !== null && previous > 0 ? (value - previous) / previous : null;
}

/**
 * Engagement rate = (likes + comments + shares + saves) ÷ views, pooled over the contents that have views and
 * at least one interaction. Saves only enter where the network reports them (Instagram), so the rate of each
 * network uses the interactions it has.
 */
export function pooledEngagement(items: DashItem[]): { value: number | null; covered: number } {
  const usable = items.filter((item) => itemEngagement(item.metrics) !== null);
  const views = usable.reduce((sum, item) => sum + (item.metrics.views ?? 0), 0);
  if (!usable.length || !views) return { value: null, covered: 0 };
  const interactions = usable.reduce((sum, item) => sum + (item.metrics.likes ?? 0) + (item.metrics.comments ?? 0) + (item.metrics.shares ?? 0) + (item.metrics.saves ?? 0), 0);
  return { value: interactions / views, covered: usable.length };
}

export interface FollowerSummary {
  /** Latest count of each connected account in the period, added. */
  total: number | null;
  /** Gain inside the period, only for accounts read at least twice in it. */
  gained: number | null;
  accounts: number;
}

export function followerSummary(snapshots: AccountSnapshot[], connectionIds: Set<string> | null, range: DayRange): FollowerSummary {
  const byConnection = new Map<string, AccountSnapshot[]>();
  for (const snapshot of snapshots) {
    if (snapshot.metrics.followers === undefined || !inRange(snapshot.day, range)) continue;
    if (connectionIds && !connectionIds.has(snapshot.connectionId)) continue;
    byConnection.set(snapshot.connectionId, [...(byConnection.get(snapshot.connectionId) ?? []), snapshot]);
  }
  if (byConnection.size === 0) return { total: null, gained: null, accounts: 0 };
  let total = 0;
  let gained: number | null = null;
  for (const list of byConnection.values()) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    const last = list[list.length - 1].metrics.followers as number;
    total += last;
    if (list.length >= 2) gained = (gained ?? 0) + last - (list[0].metrics.followers as number);
  }
  return { total, gained, accounts: byConnection.size };
}

export interface DailyPoint {
  day: string;
  /** Sum, over the period's contents, of the latest reading up to that day. Null before any reading. */
  value: number | null;
  published: number;
}

/**
 * Accumulated metric of the period's contents by reading day: each day shows how far the contents had
 * reached by then. A content counts from its first reading on, so the line only rises with real readings.
 */
export function dailySeries(items: DashItem[], key: PostMetricKey, range: DayRange): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (let offset = 0; offset < range.days; offset += 1) {
    const day = addDays(range.from, offset);
    let total: number | null = null;
    for (const item of items) {
      const reading = [...item.history].reverse().find((entry) => entry.day <= day && entry.metrics[key] !== undefined);
      if (reading) total = (total ?? 0) + (reading.metrics[key] as number);
    }
    points.push({ day, value: total, published: items.filter((item) => item.publishedDay === day).length });
  }
  return points;
}

export interface GroupRow {
  key: string;
  contents: number;
  views: number | null;
  engagement: number | null;
}

function groupBy(items: DashItem[], keyOf: (item: DashItem) => string): GroupRow[] {
  const groups = new Map<string, DashItem[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return [...groups.entries()]
    .map(([key, list]) => ({ key, contents: list.length, views: sumOf(list, 'views').value, engagement: pooledEngagement(list).value }))
    .sort((a, b) => b.contents - a.contents || (b.views ?? 0) - (a.views ?? 0));
}

export interface RankedItem {
  item: DashItem;
  value: number;
}

/** Below this many views a rate is noise; the ranking by engagement leaves those out. */
export const MIN_VIEWS_FOR_RATE = 100;

export function rankBy(items: DashItem[], metric: 'engagement' | PostMetricKey, limit = 5): RankedItem[] {
  return items
    .map((item) => {
      if (metric === 'engagement') {
        const value = (item.metrics.views ?? 0) >= MIN_VIEWS_FOR_RATE ? itemEngagement(item.metrics) : null;
        return value === null ? null : { item, value };
      }
      const value = item.metrics[metric];
      return value === undefined ? null : { item, value };
    })
    .filter((entry): entry is RankedItem => entry !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface DashboardSummary {
  ranges: { current: DayRange; previous: DayRange };
  items: DashItem[];
  kpis: Record<(typeof DASH_KPI_KEYS)[number], KpiValue>;
  publications: KpiValue;
  engagement: KpiValue;
  followers: FollowerSummary;
  byPlatform: GroupRow[];
  byFormat: GroupRow[];
  sources: { api: number; manual: number };
}

export function buildDashboard(all: DashItem[], filters: DashFilters, today: string, accountSnapshots: AccountSnapshot[], connectionIds: Set<string> | null): DashboardSummary {
  const ranges = dashRanges(filters, today);
  const scoped = scopeItems(all, filters);
  const items = scoped.filter((item) => inRange(item.publishedDay, ranges.current)).sort((a, b) => (b.publishedDay ?? '').localeCompare(a.publishedDay ?? ''));
  const previous = scoped.filter((item) => inRange(item.publishedDay, ranges.previous));

  const kpis = Object.fromEntries(
    DASH_KPI_KEYS.map((key) => {
      const now = sumOf(items, key);
      const before = sumOf(previous, key);
      return [key, { value: now.value, previous: before.value, change: change(now.value, before.value), covered: now.covered, total: items.length }];
    }),
  ) as DashboardSummary['kpis'];
  const engagementNow = pooledEngagement(items);
  const engagementBefore = pooledEngagement(previous);

  return {
    ranges,
    items,
    kpis,
    publications: { value: items.length, previous: previous.length, change: change(items.length, previous.length), covered: items.length, total: items.length },
    engagement: { value: engagementNow.value, previous: engagementBefore.value, change: change(engagementNow.value, engagementBefore.value), covered: engagementNow.covered, total: items.length },
    followers: followerSummary(accountSnapshots, connectionIds, ranges.current),
    byPlatform: groupBy(items, (item) => item.platform),
    byFormat: groupBy(items, (item) => item.formatLabel),
    sources: { api: items.filter((item) => item.source === 'api').length, manual: items.filter((item) => item.source === 'manual').length },
  };
}

/** Readable figures: 12.300 → "12,3 mil". */
export function compactNumber(value: number): string {
  return value.toLocaleString('pt-BR', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 });
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;
}

export function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${percent(Math.abs(value))}`;
}
