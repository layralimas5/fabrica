import { describe, expect, it } from 'vitest';
import type { Carousel } from '../carousel';
import { activeJobFor, publishProblems, saoPauloDate, type PublishingJob } from './job';

const carousel = (patch: Partial<Carousel> = {}) => ({ format: '4:5', caption: 'Legenda', slides: Array.from({ length: 5 }, () => ({})), ...patch }) as unknown as Carousel;
const connection = { platform: 'instagram' as const, status: 'connected' as const, scopes: ['instagram_business_basic', 'instagram_business_content_publish'] };
const now = new Date('2026-10-14T12:00:00Z');
const later = new Date('2026-10-15T12:00:00Z');

describe('publish checks', () => {
  it('accepts a valid Instagram carousel', () => {
    expect(publishProblems(carousel(), connection, later, now)).toEqual([]);
  });

  it('refuses formats, sizes, captions and times the networks reject', () => {
    expect(publishProblems(carousel({ format: '9:16' }), connection, later, now).join(' ')).toMatch(/4:5 ou 1:1/);
    expect(publishProblems(carousel({ slides: Array.from({ length: 11 }, () => ({})) as Carousel['slides'] }), connection, later, now).join(' ')).toMatch(/1 a 10/);
    expect(publishProblems(carousel({ caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') }), connection, later, now).join(' ')).toMatch(/hashtags/);
    expect(publishProblems(carousel(), connection, new Date(now.getTime() + 60_000), now).join(' ')).toMatch(/5 minutos/);
  });

  it('needs the publishing permission and a live connection, and never auto-publishes on TikTok', () => {
    expect(publishProblems(carousel(), { ...connection, scopes: ['instagram_business_basic'] }, later, now).join(' ')).toMatch(/instagram_business_content_publish/);
    expect(publishProblems(carousel(), { ...connection, status: 'expired' }, later, now).join(' ')).toMatch(/Reconecta/);
    expect(publishProblems(carousel(), { platform: 'tiktok', status: 'connected', scopes: [] }, later, now).join(' ')).toMatch(/assistida/);
    expect(publishProblems(carousel({ format: '3:4' }), { platform: 'facebook', status: 'connected', scopes: ['pages_manage_posts'] }, later, now)).toEqual([]);
  });

  it('reads the time in São Paulo and finds the live job of a carousel', () => {
    expect(saoPauloDate('2026-10-20', '19:00').toISOString()).toBe('2026-10-20T22:00:00.000Z');
    const job = (id: string, status: PublishingJob['status'], createdAt: string) => ({ id, carouselId: 'c', status, createdAt }) as PublishingJob;
    expect(activeJobFor([job('a', 'failed', '1'), job('b', 'cancelled', '2')], 'c')?.id).toBe('a');
  });
});
