import { describe, expect, it } from 'vitest';
import type { DashItem } from './items';
import { momentumOfReadings, risingPosts } from './rising';

const item = (key: string, publishedDay: string | null, readings: [string, number | undefined][]): DashItem =>
  ({ key, publishedDay, history: readings.map(([day, views]) => ({ day, metrics: views === undefined ? {} : { views } })) }) as unknown as DashItem;

describe('Em alta agora', () => {
  const today = '2026-10-15';

  it('ranks by views gained inside the window, from the last reading before it', () => {
    const old = item('old', '2026-09-01', [['2026-10-01', 10_000], ['2026-10-08', 12_000], ['2026-10-15', 20_000]]);
    const steady = item('steady', '2026-09-20', [['2026-10-08', 5_000], ['2026-10-14', 6_000]]);
    const ranked = risingPosts([steady, old], today);
    expect(ranked.map((entry) => [entry.item.key, entry.gained])).toEqual([['old', 8_000], ['steady', 1_000]]);
    expect(ranked[0]).toMatchObject({ from: '2026-10-08', to: '2026-10-15', viewsPerDay: 8_000 / 7 });
  });

  it('counts a post published inside the window from zero', () => {
    const fresh = item('fresh', '2026-10-12', [['2026-10-13', 3_000], ['2026-10-15', 4_500]]);
    expect(risingPosts([fresh], today)[0]).toMatchObject({ from: '2026-10-12', gained: 4_500 });
  });

  it('leaves out posts not read in the window, without views or that gained nothing', () => {
    const stale = item('stale', '2026-09-01', [['2026-09-20', 900], ['2026-10-01', 1_000]]);
    const noViews = item('noViews', '2026-10-01', [['2026-10-10', undefined]]);
    const flat = item('flat', '2026-09-01', [['2026-10-05', 700], ['2026-10-14', 700]]);
    expect(risingPosts([stale, noViews, flat], today)).toEqual([]);
  });

  it('tells if the post is still growing, slowing down or stopped', () => {
    expect(momentumOfReadings([{ day: '2026-10-01', views: 100 }, { day: '2026-10-02', views: 300 }])).toBe('early');
    expect(momentumOfReadings([{ day: '2026-10-01', views: 0 }, { day: '2026-10-03', views: 1_000 }, { day: '2026-10-04', views: 1_600 }])).toBe('growing');
    expect(momentumOfReadings([{ day: '2026-10-01', views: 0 }, { day: '2026-10-02', views: 1_000 }, { day: '2026-10-07', views: 1_400 }])).toBe('slowing');
    expect(momentumOfReadings([{ day: '2026-10-01', views: 0 }, { day: '2026-10-02', views: 1_000 }, { day: '2026-10-05', views: 1_010 }])).toBe('stable');
  });
});
