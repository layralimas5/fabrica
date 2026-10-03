import type { Account } from '../account';
import { isPosted, type Carousel } from '../carousel';
import { recordFromCarousel } from '../winners/fromCarousel';
import { hasAnyMetric, type ContentRecord } from '../winners/record';

/**
 * Everything Analytics measures, in one shape: each carousel of the Fábrica (with the results typed for it,
 * or the quick numbers of Testes) and each content made elsewhere and registered by hand.
 */
export interface AnalyticsItem {
  /** Results and classification. For a carousel without results yet, a record derived from it (`derived`). */
  record: ContentRecord;
  carousel: Carousel | null;
  derived: boolean;
}

/** "id:<account>" for registered accounts, the same key the winners library groups by. */
export function carouselAccountKey(carousel: Pick<Carousel, 'source'>): string | null {
  return carousel.source.accountId ? `id:${carousel.source.accountId}` : null;
}

export function analyticsItems(carousels: Carousel[], records: ContentRecord[], accounts: Account[]): AnalyticsItem[] {
  const byCarousel = new Map(records.filter((record) => record.carouselId).map((record) => [record.carouselId as string, record]));
  const items: AnalyticsItem[] = carousels.map((carousel) => {
    const record = byCarousel.get(carousel.id);
    if (record) return { record: withCarouselFacts(record, carousel), carousel, derived: false };
    const account = accounts.find((item) => item.id === carousel.source.accountId) ?? null;
    const derived: ContentRecord = {
      ...recordFromCarousel(carousel, account, null),
      id: `carousel:${carousel.id}`,
      winner: false,
      publishedAt: isPosted(carousel) ? (carousel.scheduledFor ?? carousel.updatedAt.slice(0, 10)) : carousel.scheduledFor,
      createdAt: carousel.createdAt,
      updatedAt: carousel.updatedAt,
    };
    return { record: derived, carousel, derived: true };
  });
  const known = new Set(carousels.map((carousel) => carousel.id));
  for (const record of records) if (!record.carouselId || !known.has(record.carouselId)) items.push({ record, carousel: null, derived: false });
  return items;
}

/** Template, tags and theme live on the carousel and can change after the results were typed. */
function withCarouselFacts(record: ContentRecord, carousel: Carousel): ContentRecord {
  return {
    ...record,
    accountId: record.accountId ?? carousel.source.accountId ?? null,
    visualStyle: record.visualStyle ?? carousel.source.visualStyle,
    tags: record.tags.length ? record.tags : (carousel.source.tags ?? []),
    theme: record.theme || carousel.source.theme || '',
    publishedTime: record.publishedTime ?? carousel.source.scheduledTime ?? null,
  };
}

export function isMeasured(item: AnalyticsItem): boolean {
  return hasAnyMetric(item.record.metrics) && Boolean(item.record.metrics.views);
}
