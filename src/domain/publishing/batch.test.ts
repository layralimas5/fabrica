import { describe, expect, it } from 'vitest';
import type { Carousel } from '../carousel';
import type { SocialConnection } from '../social/connection';
import { planBatch, validTimes, type BatchOptions } from './batch';
import type { PublishingJob } from './job';

const carousel = (id: string, accountId: string | null = null): Carousel =>
  ({ id, createdAt: `2026-10-0${id.length}T${id}`, format: '4:5', caption: 'Legenda', slides: [{}, {}], source: { accountId } }) as unknown as Carousel;
const tiktok = (id: string, accountId: string | null = null): SocialConnection =>
  ({ id, platform: 'tiktok', status: 'connected', scopes: ['video.upload'], accountId }) as unknown as SocialConnection;
const now = new Date('2026-10-16T12:00:00-03:00');
const options = (patch: Partial<BatchOptions> = {}): BatchOptions => ({ connectionIds: ['a', 'b'], preferOwnAccount: true, startDay: '2026-10-17', times: ['19:00', '08:00'], ...patch });
const local = (date: Date | null) => date?.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);

describe('scheduling a batch', () => {
  it('alternates the picked accounts and fills each one: the times of a day, then the next day', () => {
    const plan = planBatch(['1', '2', '3', '4', '5'].map((id) => carousel(id)), [tiktok('a'), tiktok('b')], [], options(), now);
    expect(plan.map((entry) => [entry.connection?.id, local(entry.when)])).toEqual([
      ['a', '2026-10-17 08:00'],
      ['b', '2026-10-17 08:00'],
      ['a', '2026-10-17 19:00'],
      ['b', '2026-10-17 19:00'],
      ['a', '2026-10-18 08:00'],
    ]);
    expect(plan.every((entry) => entry.problems.length === 0)).toBe(true);
  });

  it('sends a carousel to its own account when that account is picked', () => {
    const plan = planBatch([carousel('1', 'acc-b'), carousel('2', 'acc-x')], [tiktok('a', 'acc-a'), tiktok('b', 'acc-b')], [], options(), now);
    expect(plan.map((entry) => entry.connection?.id)).toEqual(['b', 'a']);
  });

  it('skips times already gone today and slots already taken by the queue', () => {
    const taken = { id: 'j', connectionId: 'a', carouselId: 'other', status: 'scheduled', scheduledAt: new Date('2026-10-16T19:00:00-03:00').toISOString(), createdAt: '1' } as PublishingJob;
    const plan = planBatch([carousel('1'), carousel('2')], [tiktok('a')], [taken], options({ connectionIds: ['a'], startDay: '2026-10-16' }), now);
    expect(plan.map((entry) => local(entry.when))).toEqual(['2026-10-17 08:00', '2026-10-17 19:00']);
  });

  it('leaves out carousels already in the queue and says why nothing can be planned', () => {
    const queued = { id: 'j', connectionId: 'a', carouselId: '1', status: 'awaiting_approval', scheduledAt: new Date('2026-10-20T10:00:00-03:00').toISOString(), createdAt: '1' } as PublishingJob;
    expect(planBatch([carousel('1')], [tiktok('a')], [queued], options(), now)[0].problems).toEqual(['Já está na fila de publicação.']);
    expect(planBatch([carousel('1')], [tiktok('a')], [], options({ connectionIds: [] }), now)[0].problems[0]).toMatch(/conta/);
    expect(planBatch([carousel('1')], [tiktok('a')], [], options({ times: ['25:00'] }), now)[0].problems[0]).toMatch(/horário/);
  });

  it('keeps the checks of each network, like the missing upload permission', () => {
    const plan = planBatch([carousel('1')], [{ ...tiktok('a'), scopes: ['video.list'] }], [], options({ connectionIds: ['a'] }), now);
    expect(plan[0].problems.join(' ')).toMatch(/video\.upload/);
  });

  it('accepts only real times, once and in order', () => {
    expect(validTimes(['19:00', '08:00', '19:00', '7:5', '24:00'])).toEqual(['08:00', '19:00']);
  });
});
