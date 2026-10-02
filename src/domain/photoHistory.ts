import type { Carousel } from './carousel';

/** How far back a photo still counts as "recently used" for an account. */
export const PHOTO_MEMORY_DAYS = 60;

interface Owner {
  brandKitId: string;
  accountId: string | null;
}

/**
 * How many recent carousels of the same account (or, without an account, the same brand) used each photo.
 * New batches start from these counts, so photos posted last week go to the end of the line.
 */
export function recentPhotoUsage(carousels: Carousel[], { brandKitId, accountId }: Owner, now: Date = new Date()): Map<string, number> {
  const since = now.getTime() - PHOTO_MEMORY_DAYS * 24 * 60 * 60 * 1000;
  const usage = new Map<string, number>();
  for (const carousel of carousels) {
    const sameOwner = accountId ? carousel.source.accountId === accountId : carousel.brandKitId === brandKitId;
    if (!sameOwner || Date.parse(carousel.createdAt) < since) continue;
    for (const id of new Set(carousel.slides.map((slide) => slide.assetId).filter((value): value is string => Boolean(value)))) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
  return usage;
}
