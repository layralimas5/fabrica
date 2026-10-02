import { isPosted, type Carousel } from '../carousel';
import type { ScriptCarousel } from '../script';
import { analyzeDna } from '../winners/dna';
import { carouselScript } from '../winners/fromCarousel';
import type { ContentRecord } from '../winners/record';
import type { ComparableContent } from './similarity';

/** A saved carousel as the detector reads it. `winning` marks contents worth varying. */
export function comparableFromCarousel(carousel: Carousel, record: ContentRecord | null, winning: boolean): ComparableContent {
  const script = carouselScript(carousel);
  const slides = script.map((beat) => beat.text.replace(/\n+/g, ' '));
  return {
    id: carousel.id,
    accountId: carousel.source.accountId ?? null,
    hook: slides[0] ?? carousel.title,
    slides,
    theme: carousel.source.theme ?? record?.theme ?? '',
    narrative: record?.dna?.narrative ?? analyzeDna({ beats: script })?.narrative ?? [],
    day: record?.publishedAt ?? carousel.scheduledFor ?? (isPosted(carousel) ? carousel.updatedAt.slice(0, 10) : null),
    originId: carousel.origin?.modelId ?? null,
    winning,
  };
}

/** A carousel still being written on the create screen. */
export function comparableFromScript(block: ScriptCarousel, key: string, accountId: string | null, theme: string, day: string | null, originId: string | null): ComparableContent {
  const slides = block.slides.map((slide) => slide.replace(/\n+/g, ' '));
  return {
    id: key,
    accountId,
    hook: slides[0] ?? block.title,
    slides,
    theme,
    narrative: analyzeDna({ beats: block.slides.map((text, index) => ({ role: index === block.productIndex ? 'product' : null, text })) })?.narrative ?? [],
    day,
    originId,
    winning: false,
  };
}
