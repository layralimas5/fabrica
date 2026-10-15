import type { Account } from '../domain/account';
import type { Carousel } from '../domain/carousel';
import type { DashItem } from '../domain/dashboard/items';
import type { Publication } from '../domain/social/publication';
import { existingRecordFor, recordFromCarousel, scriptFromText } from '../domain/winners/fromCarousel';
import { emptyRecordInput, type ContentRecord } from '../domain/winners/record';
import type { Services } from './ports';

interface Library {
  records: ContentRecord[];
  carousels: Carousel[];
  accounts: Account[];
  publications: Publication[];
}

/**
 * The content record new versions are made from. A carousel or a registered content already has one (or gets
 * one from the carousel); a post read from the network gets one from its caption, and the post is linked to it.
 */
export async function recordForContent(services: Services, item: DashItem, library: Library): Promise<{ record: ContentRecord; created: boolean }> {
  const known = item.recordId ? library.records.find((record) => record.id === item.recordId) : undefined;
  if (known) return { record: known, created: false };

  const carousel = item.carouselId ? library.carousels.find((entry) => entry.id === item.carouselId) : undefined;
  if (carousel) {
    const existing = existingRecordFor(carousel, library.records);
    if (existing) return { record: existing, created: false };
    const account = library.accounts.find((entry) => entry.id === carousel.source.accountId) ?? null;
    return { record: await services.contentRecords.create({ ...recordFromCarousel(carousel, account, null), winner: false }), created: true };
  }

  const record = await services.contentRecords.create({
    ...emptyRecordInput(),
    winner: false,
    title: item.title,
    hook: item.facts.hook,
    hookType: item.facts.hookType,
    script: scriptFromText(item.caption),
    caption: item.caption,
    platform: item.platform === 'instagram' || item.platform === 'tiktok' ? item.platform : 'outros',
    publishedAt: item.publishedDay,
    format: item.format === 'carousel' ? 'carrossel' : 'outros',
  });
  const publication = item.publicationId ? library.publications.find((entry) => entry.id === item.publicationId) : undefined;
  if (publication) await services.publications.update(publication.id, { ...publication, recordId: record.id });
  return { record, created: true };
}
