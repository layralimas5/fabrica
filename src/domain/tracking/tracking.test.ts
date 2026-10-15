import { describe, expect, it } from 'vitest';
import { cleanEvents, isBot, originAllowed, RateLimiter } from '../../../supabase/functions/_shared/tracking/ingest';
import { sanitizeLinkInput } from './links';
import {
  attributedLinkSlug,
  biggestDrop,
  buildFunnel,
  countStage,
  defaultUtm,
  eventsInRange,
  measuredStagesOf,
  newSlug,
  resultsByLink,
  trackedDestination,
  utmValue,
  type TrackingEvent,
  type TrackingLink,
} from './tracking';

let nextId = 1;
const event = (patch: Partial<TrackingEvent>): TrackingEvent => ({
  id: nextId++,
  projectId: 'p',
  name: 'lp_view',
  linkId: null,
  visitorId: null,
  verified: false,
  firstTouch: null,
  lastTouch: null,
  occurredAt: '2026-10-10T15:00:00Z',
  ...patch,
});
const touch = (link: string | null, source = 'instagram') => ({ source, medium: 'organic_social', campaign: 'momentumm', content: 'x', link, at: null });
const link = (patch: Partial<TrackingLink>): TrackingLink => ({
  id: 'l1',
  projectId: 'p',
  slug: 'abcdefgh',
  destination: 'https://momentumm.app/',
  platform: 'instagram',
  carouselId: 'c1',
  recordId: null,
  publicationId: null,
  label: '',
  utm: defaultUtm({ platform: 'instagram', project: 'Momentumm', content: 'Gancho' }),
  groupId: null,
  createdAt: '',
  ...patch,
});

describe('links and UTM', () => {
  it('turns titles into clean UTM values', () => {
    expect(utmValue('Pare de recomeçar toda Segunda!')).toBe('pare-de-recomecar-toda-segunda');
    expect(utmValue('organic_social')).toBe('organic_social');
    expect(sanitizeLinkInput({ projectId: 'p', slug: 'abcdefgh', destination: 'https://x.com', utm: defaultUtm({ platform: 'instagram', project: 'P', content: 'c' }) }).utm.medium).toBe('organic_social');
    expect(defaultUtm({ platform: 'tiktok', project: 'Lumad', content: 'Viajar sozinha' })).toEqual({ source: 'tiktok', medium: 'organic_social', campaign: 'lumad', content: 'viajar-sozinha', term: '' });
    expect(defaultUtm({ platform: 'facebook', project: 'Lumad', content: 'x', groupName: 'Mochileiras BR' })).toMatchObject({ source: 'facebook_groups', medium: 'community', term: 'mochileiras-br' });
  });

  it('adds UTM and the link id to the destination, keeping its own parameters', () => {
    const url = new URL(trackedDestination('https://momentumm.app/quiz?ref=bio', link({}).utm, 'abcdefgh'));
    expect(url.searchParams.get('ref')).toBe('bio');
    expect(url.searchParams.get('utm_source')).toBe('instagram');
    expect(url.searchParams.get('fab_l')).toBe('abcdefgh');
  });

  it('makes slugs the database accepts and refuses destinations without https', () => {
    expect(newSlug()).toMatch(/^[a-z0-9]{8}$/);
    expect(() => sanitizeLinkInput({ projectId: 'p', slug: newSlug(), destination: 'http://x.com' })).toThrow(/https/);
    expect(() => sanitizeLinkInput({ projectId: 'p', slug: 'X', destination: 'https://x.com' })).toThrow(/Código/);
  });
});

describe('funnel', () => {
  it('counts a visitor once per stage and anonymous events one by one', () => {
    const events = [event({ visitorId: 'v1' }), event({ visitorId: 'v1' }), event({ visitorId: 'v2' }), event({}), event({})];
    expect(countStage(events, 'lp_view')).toBe(4);
  });

  it('leaves unmeasured stages null and compares each stage with the previous measured one', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, index) => event({ name: 'click', linkId: 'l1', id: 100 + index })),
      ...Array.from({ length: 8 }, (_, index) => event({ visitorId: `v${index}` })),
      event({ name: 'signup', visitorId: 'v1' }),
    ];
    const funnel = buildFunnel(events, 2000, measuredStagesOf(events, true));
    const byStage = Object.fromEntries(funnel.map((step) => [step.stage, step]));
    expect(byStage.click).toMatchObject({ value: 10, fromPrevious: 10 / 2000 });
    expect(byStage.lp_view).toMatchObject({ value: 8, fromPrevious: 0.8 });
    expect(byStage.quiz_start.value).toBeNull();
    expect(byStage.signup).toMatchObject({ value: 1, fromPrevious: 1 / 8, previousStage: 'lp_view' });
    // Views are exposures, not people: the click-through rate is not the "biggest loss".
    expect(biggestDrop(funnel)?.stage).toBe('signup');
  });

  it('reads the events of a period in São Paulo days', () => {
    const late = event({ occurredAt: '2026-10-15T02:30:00Z' }); // 23:30 of the 14th in São Paulo
    expect(eventsInRange([late], '2026-10-14', '2026-10-14')).toHaveLength(1);
    expect(eventsInRange([late], '2026-10-15', '2026-10-15')).toHaveLength(0);
  });
});

describe('attribution', () => {
  const slugs = new Map([['l1', 'abcdefgh']]);

  it('credits clicks to their link and other events to the first or last known origin', () => {
    expect(attributedLinkSlug(event({ name: 'click', linkId: 'l1' }), 'first', slugs)).toBe('abcdefgh');
    const both = event({ name: 'signup', firstTouch: touch('first111'), lastTouch: touch('last2222') });
    expect(attributedLinkSlug(both, 'first', slugs)).toBe('first111');
    expect(attributedLinkSlug(both, 'last', slugs)).toBe('last2222');
    expect(attributedLinkSlug(event({ lastTouch: touch(null) }), 'last', slugs)).toBeNull();
  });

  it('sums the results of each link', () => {
    const [result] = resultsByLink([event({ name: 'click', linkId: 'l1' }), event({ visitorId: 'v', lastTouch: touch('abcdefgh') }), event({ name: 'signup', visitorId: 'v', lastTouch: touch('abcdefgh') })], [link({})], 'last');
    expect(result.counts).toMatchObject({ click: 1, lp_view: 1, signup: 1, subscription: 0 });
  });
});

describe('server-side validation of incoming events', () => {
  const now = new Date('2026-10-14T12:00:00Z');

  it('keeps the visitor id only with consent and never the query string', () => {
    const { events, rejected } = cleanEvents(
      [
        { id: 'abcdefgh12', name: 'lp_view', visitorId: 'visitor123', consent: false, path: '/?email=a@b.com', occurredAt: '2026-10-14T11:00:00Z' },
        { id: 'abcdefgh13', name: 'signup', visitorId: 'visitor123', sessionId: 'session123', consent: true, lastTouch: { source: 'instagram', link: 'abcdefgh' } },
      ],
      now,
    );
    expect(rejected).toBe(0);
    expect(events[0]).toMatchObject({ visitorId: null, pagePath: '/' });
    expect(events[1]).toMatchObject({ visitorId: 'visitor123', sessionId: 'session123', linkSlug: 'abcdefgh' });
  });

  it('refuses unknown names, missing ids, old or future events, and more than 20 per request', () => {
    const { events, rejected } = cleanEvents(
      [
        { id: 'abcdefgh14', name: 'purchase' },
        { name: 'lp_view' },
        { id: 'abcdefgh15', name: 'lp_view', occurredAt: '2026-09-01T00:00:00Z' },
        { id: 'abcdefgh16', name: 'lp_view', occurredAt: '2026-10-15T12:00:00Z' },
      ],
      now,
    );
    expect(events).toHaveLength(0);
    expect(rejected).toBe(4);
    expect(cleanEvents(Array.from({ length: 25 }, (_, index) => ({ id: `abcdefgh${index}x`, name: 'lp_view' })), now)).toMatchObject({ rejected: 5 });
    expect(cleanEvents('nope', now)).toMatchObject({ events: [], rejected: 1 });
  });

  it('drops a link slug that is not a slug', () => {
    const { events } = cleanEvents([{ id: 'abcdefgh17', name: 'lp_view', lastTouch: { link: '../../x', source: 'tiktok' } }], now);
    expect(events[0].lastTouch).toMatchObject({ link: null, source: 'tiktok' });
  });

  it('accepts only the exact allowed origins and spots link previews', () => {
    expect(originAllowed('https://momentumm.app', ['https://momentumm.app'])).toBe(true);
    expect(originAllowed('https://evil-momentumm.app', ['https://momentumm.app'])).toBe(false);
    expect(originAllowed(null, ['https://momentumm.app'])).toBe(false);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('WhatsApp/2.23')).toBe(true);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 300.0')).toBe(false);
    expect(isBot(null)).toBe(true);
  });

  it('limits a burst from the same address', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect([limiter.allow('ip', 0), limiter.allow('ip', 1), limiter.allow('ip', 2), limiter.allow('ip', 60_001)]).toEqual([true, true, false, true]);
  });
});
