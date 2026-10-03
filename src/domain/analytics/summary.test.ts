import { describe, expect, it } from 'vitest';
import { emptyPerformance, emptyRecordInput, type ContentRecord, type PerformanceMetrics } from '../winners/record';
import type { AnalyticsItem } from './items';
import type { Carousel } from '../carousel';
import { accountStats, applyAnalyticsFilters, isPublished, kpis, overdueUnposted, pooledRate, templateStats, weeklyChampion } from './summary';

let sequence = 0;
function item(overrides: Partial<Omit<ContentRecord, 'metrics'>> & { metrics?: Partial<PerformanceMetrics> } = {}): AnalyticsItem {
  sequence += 1;
  const { metrics, ...rest } = overrides;
  const record: ContentRecord = {
    ...emptyRecordInput(),
    id: `r${sequence}`,
    title: `Conteúdo ${sequence}`,
    accountId: 'a',
    publishedAt: '2026-09-30',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...rest,
    metrics: { ...emptyPerformance(), ...metrics },
  };
  return { record, carousel: null, derived: false };
}

/** Score stand-in: share rate × 1000, enough to rank. */
const scoreOf = (metrics: PerformanceMetrics) => (metrics.views && metrics.shares !== null ? Math.round((metrics.shares / metrics.views) * 1000) : null);
const base = { accountId: null, platform: 'all' as const, period: 'all' as const, from: '', to: '', kind: 'all' as const };

describe('analytics summary', () => {
  it('finds carousels past their posting day that were never marked as posted', () => {
    const withCarousel = (status: Carousel['status'], scheduledFor: string | null) => ({ ...item(), carousel: { id: `c${status}${scheduledFor}`, status, scheduledFor } as Carousel });
    const items = [
      withCarousel('ready', '2026-09-28'),
      withCarousel('draft', '2026-10-01'),
      withCarousel('ready', '2026-10-03'),
      withCarousel('ready', null),
      withCarousel('published', '2026-09-20'),
      withCarousel('archived', '2026-09-20'),
    ];
    const overdue = overdueUnposted(items, '2026-10-03');
    expect(overdue).toEqual([items[0], items[1]]);
    expect(items.filter(isPublished)).toEqual([items[4]]);
  });


  it('filters by account, platform, content kind and period together', () => {
    const items = [
      item({ platform: 'tiktok', format: 'carrossel' }),
      item({ platform: 'tiktok', format: 'pov' }),
      item({ platform: 'instagram', format: 'carrossel', accountId: 'b' }),
      item({ platform: 'tiktok', format: 'carrossel', publishedAt: '2026-08-01' }),
    ];
    expect(applyAnalyticsFilters(items, { ...base, platform: 'tiktok', kind: 'carrossel', period: '30' }, '2026-10-02')).toEqual([items[0]]);
    expect(applyAnalyticsFilters(items, { ...base, kind: 'video' }, '2026-10-02')).toEqual([items[1]]);
    expect(applyAnalyticsFilters(items, { ...base, accountId: 'b' }, '2026-10-02')).toEqual([items[2]]);
  });

  it('totals only what was measured and pools rates over views', () => {
    const items = [item({ metrics: { views: 1000, saves: 100 } }), item({ metrics: { views: 3000 } })];
    const [views, saves, clicks] = kpis(items, ['views', 'saves', 'clicks']);
    expect(views).toEqual({ key: 'views', total: 4000, measured: 2 });
    expect(saves).toEqual({ key: 'saves', total: 100, measured: 1 });
    expect(clicks.measured).toBe(0);
    expect(pooledRate(items, 'saves')).toBe(0.1);
  });

  it('crowns the best content of the last 7 days only', () => {
    const old = item({ publishedAt: '2026-09-01', metrics: { views: 1000, shares: 500 } });
    const recent = item({ publishedAt: '2026-09-30', metrics: { views: 1000, shares: 50 } });
    expect(weeklyChampion([old, recent], scoreOf, '2026-10-02')?.item).toBe(recent);
    expect(weeklyChampion([old], scoreOf, '2026-10-02')).toBeNull();
  });

  it('compares accounts by proportional rates', () => {
    const items = [
      item({ accountId: 'a', metrics: { views: 100_000, shares: 500 } }),
      item({ accountId: 'b', metrics: { views: 2_000, shares: 100 } }),
    ];
    const stats = accountStats(items, scoreOf);
    expect(stats.map((stat) => stat.account)).toEqual(['id:a', 'id:b']);
    expect(stats[1].shareRate).toBeGreaterThan(stats[0].shareRate ?? 0);
  });

  it('ranks templates by average score and counts uses', () => {
    const items = [
      item({ visualStyle: 'tiktok', metrics: { views: 1000, shares: 80 } }),
      item({ visualStyle: 'tiktok', metrics: { views: 1000, shares: 60 } }),
      item({ visualStyle: 'minimalista', metrics: { views: 1000, shares: 10 } }),
    ];
    const [first, second] = templateStats(items, scoreOf);
    expect(first).toMatchObject({ template: 'tiktok', uses: 2, averageScore: 70 });
    expect(second.template).toBe('minimalista');
  });
});
