import { describe, expect, it } from 'vitest';
import type { DashItem } from '../dashboard/items';
import { defaultUtm, type TrackingEvent, type TrackingLink } from '../tracking/tracking';
import { analysisBriefing, compareGroups, contentResults, findings, rankResults, weeklySummary, type ContentResult } from './intelligence';

const item = (key: string, metrics: DashItem['metrics'], patch: Partial<DashItem> = {}): DashItem => ({
  key,
  title: key,
  caption: '',
  platform: 'instagram',
  accountKey: null,
  project: 'Momentumm',
  format: 'carousel',
  formatLabel: 'Carrossel',
  publishedDay: '2026-10-10',
  source: 'api',
  history: [],
  metrics,
  lastReadAt: null,
  carouselId: `c-${key}`,
  recordId: null,
  publicationId: null,
  thumbnailUrl: null,
  permalink: null,
  manualConversions: null,
  facts: { hook: '', hookType: 'dor', cta: 'Salva pra lembrar', theme: 'metas' },
  ...patch,
});
const link = (key: string, slug: string): TrackingLink => ({
  id: `l-${key}`,
  projectId: 'p',
  slug,
  destination: 'https://momentumm.app/',
  platform: 'instagram',
  carouselId: `c-${key}`,
  recordId: null,
  publicationId: null,
  label: '',
  utm: defaultUtm({ platform: 'instagram', project: 'Momentumm', content: key }),
  groupId: null,
  createdAt: '',
});
let id = 1;
const event = (name: TrackingEvent['name'], slug: string, linkId: string | null = null, visitorId: string | null = null): TrackingEvent => ({
  id: id++,
  projectId: 'p',
  name,
  linkId,
  visitorId,
  verified: false,
  firstTouch: null,
  lastTouch: { source: 'instagram', medium: null, campaign: null, content: null, link: slug, at: null },
  occurredAt: '2026-10-10T15:00:00Z',
});

describe('content results', () => {
  it('credits tracked events to the content of the link and leaves contents without links unknown', () => {
    const results = contentResults(
      [item('a', { views: 5000 }), item('b', { views: 200 })],
      [link('a', 'aaaaaaaa')],
      [event('click', 'aaaaaaaa', 'l-a'), event('click', 'aaaaaaaa', 'l-a'), event('lp_view', 'aaaaaaaa', null, 'v1'), event('signup', 'aaaaaaaa', null, 'v1')],
    );
    expect(results[0]).toMatchObject({ clicks: 2, visits: 1, signups: 1, hasLinks: true });
    expect(results[1]).toMatchObject({ clicks: null, visits: null, signups: null, hasLinks: false });
    expect(rankResults(results, 'clicks').map((result) => result.item.key)).toEqual(['a']);
  });
});

describe('findings', () => {
  const result = (key: string, metrics: DashItem['metrics'], tracked: Partial<ContentResult> = {}): ContentResult => ({
    item: item(key, metrics),
    engagement: metrics.views && metrics.likes ? metrics.likes / metrics.views : null,
    clicks: null,
    visits: null,
    signups: null,
    hasLinks: false,
    ...tracked,
  });

  it('flags many views without a tracked link, and many views with no clicks, quoting the numbers', () => {
    const list = findings([result('viral', { views: 40000, likes: 400 }), result('linked', { views: 30000, likes: 300 }, { hasLinks: true, clicks: 0, visits: 0, signups: 0 }), result('small', { views: 300, likes: 3 })], false, false);
    const viral = list.find((finding) => finding.result.item.key === 'viral');
    const linked = list.find((finding) => finding.result.item.key === 'linked');
    expect(viral?.kind).toBe('views_no_link');
    expect(viral?.evidence).toContain('40.000');
    expect(linked?.kind).toBe('views_no_clicks');
    expect(linked?.evidence).toContain('0 cliques');
    expect(linked?.suggestions.join(' ')).toMatch(/CTA|landing page/);
    expect(list.some((finding) => finding.result.item.key === 'small' && finding.kind.startsWith('views'))).toBe(false);
  });

  it('does not judge visits or sign-ups the project does not measure', () => {
    const list = findings([result('a', { views: 500 }, { hasLinks: true, clicks: 50, visits: 2, signups: 0 })], false, false);
    expect(list.filter((finding) => finding.kind === 'clicks_no_visits' || finding.kind === 'visits_no_signups')).toHaveLength(0);
    const measured = findings([result('a', { views: 500 }, { hasLinks: true, clicks: 50, visits: 30, signups: 0 })], true, true);
    expect(measured.map((finding) => finding.kind)).toContain('visits_no_signups');
  });
});

describe('comparisons and summary', () => {
  it('groups by hook type and marks small samples', () => {
    const results = contentResults([item('a', { views: 1000, likes: 100 }), item('b', { views: 1000, likes: 50 }, { facts: { hook: '', hookType: 'lista', cta: '', theme: '' } })], [], []);
    const groups = compareGroups(results, 'hookType');
    expect(groups.map((group) => group.label)).toEqual(['Dor', 'Lista']);
    expect(groups[0]).toMatchObject({ contents: 1, small: true, clicksPerThousand: null });
    expect(groups[0].engagement).toBeCloseTo(0.1);
  });

  it('writes the week only with what was measured', () => {
    const range = { from: '2026-10-08', to: '2026-10-14', days: 7 };
    const summary = weeklySummary(contentResults([item('a', { views: 1000, likes: 100 })], [], []), [], range, [], { clicks: false, signups: false });
    expect(summary.lines.join(' ')).toContain('1.000 visualizações');
    expect(summary.lines.join(' ')).toContain('Cliques não medidos');
    expect(summary.signups).toBeNull();
    expect(summary.lines.join(' ')).not.toMatch(/cadastros registrados/);
  });

  it('builds a briefing that carries the numbers and says what is unknown', () => {
    const results = contentResults([item('a', { views: 1000, likes: 100 })], [], []);
    const range = { from: '2026-10-08', to: '2026-10-14', days: 7 };
    const text = analysisBriefing('Momentumm', weeklySummary(results, [], range, [], { clicks: false, signups: false }), results, [], [{ title: 'Ganchos', rows: compareGroups(results, 'hookType') }]);
    expect(text).toContain('Projeto: Momentumm');
    expect(text).toContain('sem link');
    expect(text).toContain('(amostra pequena)');
  });
});
