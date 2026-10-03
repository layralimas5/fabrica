import type { Asset } from './asset';
import type { CarouselDraft, SlideDraft } from './aiContract';
import { DEFAULT_CARD, DEFAULT_SLIDE_STYLE, DEFAULT_TEXT_STYLE, newSlideId, type ProductDisplay, type Slide, type TextStyle } from './carousel';
import { CTA_BY_OBJECTIVE, MAX_COPY_SLIDES, MAX_SLIDES, TEXT_LIMITS, type Objective } from './content';
import { matchImages } from './imageMatching';
import type { VisualStyle } from './brandKit';
import { assignLayouts, type LayoutId } from './layouts';
import { limitWords } from './text';

/** Styles that imitate a platform format use one layout everywhere instead of a varied rhythm. */
const FIXED_LAYOUTS: Partial<Record<VisualStyle, { withImage: LayoutId; withoutImage: LayoutId; imageOnCta: boolean }>> = {
  post: { withImage: 'post_image', withoutImage: 'post_text', imageOnCta: false },
  tiktok: { withImage: 'native_photo', withoutImage: 'big_statement', imageOnCta: true },
};

interface ComposeOptions {
  objective: Objective;
  assets: Asset[];
  visualStyle?: VisualStyle;
  /** User-written copy: keep every word exactly as typed. */
  preserveText?: boolean;
  /** Append the objective CTA when the last slide is not one. */
  addCta?: boolean;
  /** Product screenshot: always used by the product slide, never picked for other slides. */
  productAssetId?: string | null;
  /** 'card': the product slide gets a library photo as background and the screenshot as a floating card. */
  productDisplay?: ProductDisplay;
  /** Fill slides that want a photo by keyword matching. Off when photos were already matched by the AI. */
  autoMatch?: boolean;
  /** Post model with text only: no photos, except the product image on the product slide. */
  textOnly?: boolean;
  /** Text size, width and line spacing applied to every slide. */
  textStyle?: TextStyle;
}

/** Which slides of a draft get a photo in a visual style (platform-native styles want one everywhere). */
export function slidesWantingImages(draft: CarouselDraft, visualStyle?: VisualStyle, textOnly = false): boolean[] {
  if (textOnly) return draft.slides.map(() => false);
  const fixed = visualStyle ? FIXED_LAYOUTS[visualStyle] : undefined;
  return draft.slides.map((slide) => (fixed ? fixed.imageOnCta || slide.role !== 'cta' : slide.wantsImage));
}

/** Text a photo has to relate to. */
export function slideText(slide: Pick<SlideDraft, 'title' | 'subtitle' | 'body' | 'bullets'>): string {
  return [slide.title, slide.subtitle, slide.body, ...slide.bullets].filter(Boolean).join(' ');
}

/** Turns an AI draft into renderable slides: enforces readability, the CTA ending, image choice and layout rhythm. */
export function composeSlides(
  draft: CarouselDraft,
  { objective, assets, visualStyle, preserveText = false, addCta = true, productAssetId = null, productDisplay = 'full', autoMatch = true, textOnly = false, textStyle = DEFAULT_TEXT_STYLE }: ComposeOptions,
): Slide[] {
  const fixed = visualStyle ? FIXED_LAYOUTS[visualStyle] : undefined;
  const limit = preserveText ? MAX_COPY_SLIDES : MAX_SLIDES;
  const readable = preserveText ? draft.slides.slice(0, limit) : draft.slides.slice(0, limit).map(enforceReadability);
  const asCard = (slide: SlideDraft) => slide.role === 'product' && productAssetId !== null && productDisplay === 'card';
  const drafts = (addCta ? ensureCta(readable, objective, limit) : readable).map((slide) => {
    // A cut-out sits over a photo, so the product slide wants one even in text-only styles.
    if (asCard(slide)) return { ...slide, wantsImage: true, assetId: slide.assetId === productAssetId ? null : slide.assetId };
    if (textOnly) return { ...slide, wantsImage: false, assetId: null };
    return fixed ? { ...slide, wantsImage: fixed.imageOnCta || slide.role !== 'cta' } : slide;
  });
  const library = assets.filter((asset) => asset.id !== productAssetId);
  const knownIds = new Set(library.map((asset) => asset.id));
  const showsProduct = (slide: SlideDraft) => slide.role === 'product' && productAssetId !== null && !asCard(slide);

  const imageRequests = drafts.map((slide) =>
    autoMatch && slide.wantsImage && !showsProduct(slide) && !(slide.assetId && knownIds.has(slide.assetId)) ? slideText(slide) : null,
  );
  const matched = matchImages(imageRequests, library.filter((asset) => !drafts.some((slide) => slide.assetId === asset.id)));

  const assetIds = drafts.map((slide, index) => {
    if (showsProduct(slide)) return productAssetId;
    if (slide.assetId && knownIds.has(slide.assetId)) return slide.assetId;
    return matched[index];
  });

  const layouts: LayoutId[] = fixed
    ? assetIds.map((assetId) => (assetId ? fixed.withImage : fixed.withoutImage))
    : assignLayouts(
        drafts.map((slide, index) => ({
          role: slide.role,
          hasBullets: slide.bullets.length > 1,
          hasImage: assetIds[index] !== null,
          // The cut-out reads best over a full photo with the text at the bottom.
          forced: asCard(slide) && assetIds[index] !== null ? 'image_full_quote' : null,
        })),
        visualStyle,
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
    style: { ...DEFAULT_SLIDE_STYLE, ...textStyle },
    card: asCard(slide) && productAssetId ? { assetId: productAssetId, ...DEFAULT_CARD } : null,
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

/** Ends with a CTA: the one written in the copy wherever it is, or a standard one for the objective. */
function ensureCta(slides: SlideDraft[], objective: Objective, limit: number): SlideDraft[] {
  if (slides.some((slide) => slide.role === 'cta')) return slides;
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
  return [...slides.slice(0, limit - 1), cta];
}

