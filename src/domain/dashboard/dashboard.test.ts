import { describe, expect, it } from 'vitest';
import type { AnalyticsItem } from '../analytics/items';
import type { Carousel } from '../carousel';
import { sanitizePublicationInput, type Publication } from '../social/publication';
import { emptyRecordInput, type ContentRecord } from '../winners/record';
import { buildDashboard, dailySeries, dashRanges, followerSummary, pooledEngagement, rankBy, type DashFilters } from './dashboard';
import { buildDashItems, itemEngagement, type DashItem } from './items';

const TODAY = '2026-10-14';
const filters = (patch: Partial<DashFilters> = {}): DashFilters => ({ project: null, platform: 'all', accountKey: null, period: '7', from: '', to: '', ...patch });

const item = (patch: Partial<DashItem>): DashItem => ({
  key: Math.random().toString(36),
  title: 't',
  caption: '',
  platform: 'instagram',
  accountKey: 'acc:a',
  project: 'Momentumm',
  format: 'carousel',
  formatLabel: 'Carrossel',
  publishedDay: '2026-10-10',
  source: 'api',
  history: [],
  metrics: {},
  lastReadAt: null,
  carouselId: null,
  recordId: null,
  publicationId: null,
  thumbnailUrl: null,
  permalink: null,
  manualConversions: null,
  ...patch,
});

describe('periods', () => {
  it('ends today and compares with the same length right before', () => {
    expect(dashRanges({ period: '7', from: '', to: '' }, TODAY)).toEqual({
      current: { from: '2026-10-08', to: '2026-10-14', days: 7 },
      previous: { from: '2026-10-01', to: '2026-10-07', days: 7 },
    });
    expect(dashRanges({ period: 'custom', from: '2026-09-01', to: '2026-09-10' }, TODAY).previous).toEqual({ from: '2026-08-22', to: '2026-08-31', days: 10 });
  });
});

describe('KPIs', () => {
  it('adds only contents that have the metric and says how many they are', () => {
    const summary = buildDashboard([item({ metrics: { views: 100, reach: 80 } }), item({ metrics: { views: 50 }, platform: 'tiktok' })], filters(), TODAY, [], null);
    expect(summary.kpis.views).toMatchObject({ value: 150, covered: 2, total: 2 });
    expect(summary.kpis.reach).toMatchObject({ value: 80, covered: 1 });
    expect(summary.kpis.saves).toMatchObject({ value: null, covered: 0 });
  });

  it('never computes growth without a base in the previous period', () => {
    const summary = buildDashboard([item({ metrics: { views: 100 } })], filters(), TODAY, [], null);
    expect(summary.kpis.views.previous).toBeNull();
    expect(summary.kpis.views.change).toBeNull();
    const withBase = buildDashboard([item({ metrics: { views: 150 } }), item({ publishedDay: '2026-10-02', metrics: { views: 100 } })], filters(), TODAY, [], null);
    expect(withBase.kpis.views.change).toBeCloseTo(0.5);
    expect(withBase.publications).toMatchObject({ value: 1, previous: 1, change: 0 });
  });

  it('filters by project, platform and account', () => {
    const all = [item({ project: 'Lumad', platform: 'facebook' }), item({ project: 'momentumm', accountKey: 'acc:b' })];
    expect(buildDashboard(all, filters({ project: 'Momentumm' }), TODAY, [], null).items).toHaveLength(1);
    expect(buildDashboard(all, filters({ platform: 'facebook' }), TODAY, [], null).items[0].project).toBe('Lumad');
    expect(buildDashboard(all, filters({ accountKey: 'acc:b' }), TODAY, [], null).items).toHaveLength(1);
  });
});

describe('engagement', () => {
  it('pools interactions over views and ignores contents without views', () => {
    expect(itemEngagement({ likes: 10 })).toBeNull();
    expect(itemEngagement({ views: 100 })).toBeNull();
    expect(itemEngagement({ views: 100, likes: 5, saves: 5 })).toBeCloseTo(0.1);
    const pooled = pooledEngagement([item({ metrics: { views: 100, likes: 10 } }), item({ metrics: { views: 300, likes: 10, comments: 10 } }), item({ metrics: { likes: 99 } })]);
    expect(pooled.value).toBeCloseTo(30 / 400);
    expect(pooled.covered).toBe(2);
  });

  it('ranks by engagement only with enough views to mean something', () => {
    const ranked = rankBy([item({ metrics: { views: 50, likes: 40 } }), item({ title: 'ok', metrics: { views: 1000, likes: 50 } })], 'engagement');
    expect(ranked.map((entry) => entry.item.title)).toEqual(['ok']);
  });
});

describe('followers and daily series', () => {
  const range = { from: '2026-10-08', to: '2026-10-14', days: 7 };

  it('sums the latest count per account and the gain only where read twice', () => {
    const snapshots = [
      { connectionId: 'c1', day: '2026-10-09', metrics: { followers: 100 }, capturedAt: '' },
      { connectionId: 'c1', day: '2026-10-13', metrics: { followers: 130 }, capturedAt: '' },
      { connectionId: 'c2', day: '2026-10-12', metrics: { followers: 50 }, capturedAt: '' },
      { connectionId: 'c2', day: '2026-09-01', metrics: { followers: 10 }, capturedAt: '' },
    ];
    expect(followerSummary(snapshots, null, range)).toEqual({ total: 180, gained: 30, accounts: 2 });
    expect(followerSummary(snapshots, new Set(['c2']), range)).toEqual({ total: 50, gained: null, accounts: 1 });
    expect(followerSummary([], null, range).total).toBeNull();
  });

  it('accumulates the latest reading of each content per day, null before any reading', () => {
    const series = dailySeries(
      [
        item({ publishedDay: '2026-10-09', history: [{ day: '2026-10-10', metrics: { views: 100 } }, { day: '2026-10-12', metrics: { views: 300 } }] }),
        item({ publishedDay: '2026-10-11', history: [{ day: '2026-10-11', metrics: { views: 50 } }] }),
      ],
      'views',
      range,
    );
    expect(series.map((point) => point.value)).toEqual([null, null, 100, 150, 350, 350, 350]);
    expect(series.find((point) => point.day === '2026-10-09')?.published).toBe(1);
  });
});

describe('building items from the sources', () => {
  const record = (patch: Partial<ContentRecord>): ContentRecord => ({ ...emptyRecordInput(), id: 'r1', createdAt: '2026-10-01', updatedAt: '', winner: false, ...patch });
  const publication = (patch: Partial<Publication>): Publication => ({ ...sanitizePublicationInput({ platform: 'instagram', externalId: 'm1', source: 'sync' }), id: 'p1', createdAt: '', updatedAt: '', ...patch });

  it('uses the API numbers for a synced content and never adds the manual ones on top', () => {
    const carousel = { id: 'c1', project: 'Momentumm', status: 'published', source: {} } as unknown as Carousel;
    const manual: AnalyticsItem = { record: record({ carouselId: 'c1', publishedAt: '2026-10-10', metrics: { ...emptyRecordInput().metrics, views: 999 } }), carousel, derived: false };
    const items = buildDashItems({
      analyticsItems: [manual],
      publications: [publication({ carouselId: 'c1', publishedAt: '2026-10-10T12:00:00Z' })],
      snapshots: [{ publicationId: 'p1', day: '2026-10-12', metrics: { views: 120 }, capturedAt: '2026-10-12T10:00:00Z' }],
      connections: [],
      accounts: [],
      projects: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'api', metrics: { views: 120 }, project: 'Momentumm', publishedDay: '2026-10-10' });
  });

  it('keeps the manual numbers when the linked post was never synced', () => {
    const items = buildDashItems({
      analyticsItems: [{ record: record({ publishedAt: '2026-10-10', metrics: { ...emptyRecordInput().metrics, views: 40, clicks: 3 } }), carousel: null, derived: false }],
      publications: [publication({ recordId: 'r1', source: 'manual', permalink: 'https://www.instagram.com/p/x/' })],
      snapshots: [],
      connections: [],
      accounts: [],
      projects: [],
    });
    expect(items[0]).toMatchObject({ source: 'manual', metrics: { views: 40 }, permalink: 'https://www.instagram.com/p/x/', manualConversions: { clicks: 3, signups: null } });
  });
});
