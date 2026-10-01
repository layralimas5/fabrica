import type { Asset } from './asset';
import type { CarouselDraft, SlideDraft } from './aiContract';
import { DEFAULT_SLIDE_STYLE, newSlideId, type Slide } from './carousel';
import { CTA_BY_OBJECTIVE, MAX_SLIDES, TEXT_LIMITS, type Objective } from './content';
import { matchImages } from './imageMatching';
import { assignLayouts } from './layouts';
import { limitWords } from './text';

interface ComposeOptions {
  objective: Objective;
  assets: Asset[];
}

/** Turns an AI draft into renderable slides: enforces readability, the CTA ending, image choice and layout rhythm. */
export function composeSlides(draft: CarouselDraft, { objective, assets }: ComposeOptions): Slide[] {
  const drafts = ensureCta(draft.slides.slice(0, MAX_SLIDES).map(enforceReadability), objective);
  const knownIds = new Set(assets.map((asset) => asset.id));

  const imageRequests = drafts.map((slide) =>
    slide.wantsImage && !(slide.assetId && knownIds.has(slide.assetId)) ? slideText(slide) : null,
  );
  const matched = matchImages(imageRequests, assets.filter((asset) => !drafts.some((slide) => slide.assetId === asset.id)));

  const assetIds = drafts.map((slide, index) => {
    if (slide.assetId && knownIds.has(slide.assetId)) return slide.assetId;
    return matched[index];
  });

  const layouts = assignLayouts(
    drafts.map((slide, index) => ({
      role: slide.role,
      hasBullets: slide.bullets.length > 1,
      hasImage: assetIds[index] !== null,
      suggested: slide.layout,
    })),
  );

  return drafts.map((slide, index) => ({
    id: newSlideId(),
    role: slide.role,
    title: slide.title,
    subtitle: slide.subtitle,
    body: slide.body,
    bullets: slide.bullets,
    assetId: assetIds[index],
    layout: layouts[index],
    style: { ...DEFAULT_SLIDE_STYLE },
  }));
}

function enforceReadability(slide: SlideDraft, index: number): SlideDraft {
  const titleLimit = index === 0 ? TEXT_LIMITS.hookWords : TEXT_LIMITS.titleWords;
  return {
    ...slide,
    title: limitWords(slide.title, titleLimit),
    subtitle: slide.subtitle ? limitWords(slide.subtitle, TEXT_LIMITS.titleWords) : null,
    body: index === 0 ? null : slide.body ? limitWords(slide.body, TEXT_LIMITS.bodyWords) : null,
    bullets: slide.bullets.slice(0, TEXT_LIMITS.bullets).map((bullet) => limitWords(bullet, TEXT_LIMITS.bulletWords)),
  };
}

function ensureCta(slides: SlideDraft[], objective: Objective): SlideDraft[] {
  if (slides.at(-1)?.role === 'cta') return slides;
  const cta: SlideDraft = {
    role: 'cta',
    title: CTA_BY_OBJECTIVE[objective],
    subtitle: null,
    body: null,
    bullets: [],
    assetId: null,
    layout: 'cta',
    wantsImage: false,
  };
  return [...slides.slice(0, MAX_SLIDES - 1), cta];
}

function slideText(slide: SlideDraft): string {
  return [slide.title, slide.subtitle, slide.body, ...slide.bullets].filter(Boolean).join(' ');
}
