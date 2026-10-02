import type { Account } from '../account';
import { VISUAL_STYLE_LABELS } from '../brandKit';
import type { Carousel } from '../carousel';
import { analyzeDna, classifyHook } from './dna';
import { carouselPerformance } from './family';
import { emptyPerformance, emptyRecordInput, type ContentRecord, type ContentRecordInput, type ScriptBeat } from './record';

export function carouselScript(carousel: Carousel): ScriptBeat[] {
  return carousel.slides
    .map((slide) => ({ role: slide.role, text: [slide.title, slide.subtitle, slide.body, ...slide.bullets].filter(Boolean).join('\n').trim() }))
    .filter((beat) => beat.text);
}

/** Script of content made outside the Fábrica: one line (or `Slide N,` block) per slide or scene. */
export function scriptFromText(text: string): ScriptBeat[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(slide|cena)\s*\d+\s*[:,.\-–—]?\s*/i, '').trim())
    .filter(Boolean)
    .map((line) => ({ role: null, text: line }));
}

export function scriptToText(script: ScriptBeat[]): string {
  return script.map((beat) => beat.text.replace(/\n+/g, ' // ')).join('\n');
}

/** Everything the carousel already knows, so marking it as a winner only asks for the numbers. */
export function recordFromCarousel(carousel: Carousel, account: Account | null, productName: string | null): ContentRecordInput {
  const script = carouselScript(carousel);
  const hook = script[0]?.text.replace(/\n+/g, ' ') ?? carousel.title;
  return {
    ...emptyRecordInput(),
    carouselId: carousel.id,
    title: carousel.title,
    hook,
    script,
    platform: account?.platform ?? 'instagram',
    accountId: account?.id ?? null,
    publishedAt: carousel.scheduledFor,
    format: 'carrossel',
    hookType: classifyHook(hook),
    productPresence: carousel.slides.some((slide) => slide.role === 'product') ? 'aparece' : 'nao_aparece',
    slideCount: carousel.slides.length,
    metrics: carouselPerformance(carousel.metrics) ?? emptyPerformance(),
    dna: analyzeDna({ beats: script, caption: carousel.caption, productName, visualStyle: VISUAL_STYLE_LABELS[carousel.source.visualStyle] }),
    origin: carousel.origin,
  };
}

/** Results of a content that already has a record keep it; otherwise a new one starts from the carousel. */
export function existingRecordFor(carousel: Carousel, records: ContentRecord[]): ContentRecord | null {
  return records.find((record) => record.carouselId === carousel.id) ?? null;
}
