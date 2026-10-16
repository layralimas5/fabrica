import { describe, expect, it } from 'vitest';
import { emptyPerformance, emptyRecordInput, type ContentRecord, type PerformanceMetrics } from '../winners/record';
import type { AnalyticsItem } from './items';
import type { Carousel } from '../carousel';
import { isPublished, pooledRate } from './summary';

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

describe('analytics summary', () => {
  it('counts posted carousels as published', () => {
    const withCarousel = (status: Carousel['status'], scheduledFor: string | null) => ({ ...item(), carousel: { id: `c${status}${scheduledFor}`, status, scheduledFor } as Carousel });
    const items = [
      withCarousel('ready', '2026-09-28'),
      withCarousel('draft', '2026-10-01'),
      withCarousel('ready', '2026-10-03'),
      withCarousel('ready', null),
      withCarousel('published', '2026-09-20'),
      withCarousel('archived', '2026-09-20'),
    ];
    expect(items.filter(isPublished)).toEqual([items[4]]);
  });

  it('pools rates over views', () => {
    const items = [item({ metrics: { views: 1000, saves: 100 } }), item({ metrics: { views: 3000 } })];
    expect(pooledRate(items, 'saves')).toBe(0.1);
  });
});
