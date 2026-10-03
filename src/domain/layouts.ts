import type { VisualStyle } from './brandKit';
import type { SlideRole } from './content';

export const LAYOUT_IDS = [
  'text_center',
  'big_statement',
  'image_full_quote',
  'image_top_text_bottom',
  'image_left_text_right',
  'text_side',
  'list',
  'cta',
  'post_image',
  'post_text',
  'native_photo',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export interface LayoutMeta {
  id: LayoutId;
  label: string;
  needsImage: boolean;
  textOnlyFallback: LayoutId;
}

export const LAYOUTS: Record<LayoutId, LayoutMeta> = {
  text_center: { id: 'text_center', label: 'Texto central', needsImage: false, textOnlyFallback: 'text_center' },
  big_statement: { id: 'big_statement', label: 'Frase de destaque', needsImage: false, textOnlyFallback: 'big_statement' },
  image_full_quote: { id: 'image_full_quote', label: 'Imagem cheia + frase', needsImage: true, textOnlyFallback: 'big_statement' },
  image_top_text_bottom: { id: 'image_top_text_bottom', label: 'Imagem em cima', needsImage: true, textOnlyFallback: 'text_side' },
  image_left_text_right: { id: 'image_left_text_right', label: 'Imagem + texto lateral', needsImage: true, textOnlyFallback: 'text_side' },
  text_side: { id: 'text_side', label: 'Texto lateral', needsImage: false, textOnlyFallback: 'text_side' },
  list: { id: 'list', label: 'Lista', needsImage: false, textOnlyFallback: 'list' },
  cta: { id: 'cta', label: 'CTA', needsImage: false, textOnlyFallback: 'cta' },
  post_image: { id: 'post_image', label: 'Post + imagem', needsImage: true, textOnlyFallback: 'post_text' },
  post_text: { id: 'post_text', label: 'Post só texto', needsImage: false, textOnlyFallback: 'post_text' },
  native_photo: { id: 'native_photo', label: 'Foto + texto (TikTok)', needsImage: true, textOnlyFallback: 'big_statement' },
};

export const POST_LAYOUTS: LayoutId[] = ['post_image', 'post_text'];

/**
 * One look per visual style: every photo slide uses the same layout, every text slide another, so the carousel reads
 * as one piece instead of a mix of templates. The cover (first slide) opens on the full photo when it has one.
 */
export interface StyleLook {
  cover: LayoutId;
  image: LayoutId;
  text: LayoutId;
}

export const STYLE_LOOKS: Record<VisualStyle, StyleLook> = {
  minimalista: { cover: 'image_full_quote', image: 'image_top_text_bottom', text: 'text_center' },
  editorial: { cover: 'image_full_quote', image: 'image_top_text_bottom', text: 'text_side' },
  clean: { cover: 'image_full_quote', image: 'image_top_text_bottom', text: 'text_center' },
  bold: { cover: 'image_full_quote', image: 'image_full_quote', text: 'text_center' },
  dark: { cover: 'image_full_quote', image: 'image_full_quote', text: 'text_center' },
  lifestyle: { cover: 'image_full_quote', image: 'image_full_quote', text: 'text_center' },
  post: { cover: 'post_image', image: 'post_image', text: 'post_text' },
  tiktok: { cover: 'native_photo', image: 'native_photo', text: 'big_statement' },
};

const DEFAULT_STYLE: VisualStyle = 'minimalista';

interface LayoutCandidate {
  role: SlideRole;
  hasBullets: boolean;
  hasImage: boolean;
  /** Set only when the slide needs a specific layout to work (the app cut-out over a full photo). */
  forced?: LayoutId | null;
}

/** Picks one layout per slide from the style's look: same kind of slide, same layout, all through the carousel. */
export function assignLayouts(slides: LayoutCandidate[], style: VisualStyle = DEFAULT_STYLE): LayoutId[] {
  const look = STYLE_LOOKS[style];
  return slides.map((slide, index) => {
    if (slide.forced) return LAYOUTS[slide.forced].needsImage && !slide.hasImage ? look.text : slide.forced;
    if (slide.role === 'cta' && !slide.hasImage) return 'cta';
    if (slide.hasBullets && !slide.hasImage) return 'list';
    if (!slide.hasImage) return look.text;
    return index === 0 ? look.cover : look.image;
  });
}

/** Layouts a slide can switch to. Lists accept any slide: body sentences become items when there are no bullets. */
export function compatibleLayouts(hasImage: boolean): LayoutId[] {
  return LAYOUT_IDS.filter((id) => hasImage || !LAYOUTS[id].needsImage);
}

/**
 * Layout a slide should switch to when it gains an image, so the new photo is actually visible.
 * A slide with an app cut-out shows the photo full, so the card has room over it.
 */
export function layoutWithImage(layout: LayoutId, style: VisualStyle, hasCard = false): LayoutId {
  if (LAYOUTS[layout].needsImage) return hasCard && style !== 'post' ? 'image_full_quote' : layout;
  if (hasCard && style !== 'post' && style !== 'tiktok') return 'image_full_quote';
  return STYLE_LOOKS[style].image;
}

/** Layout a slide falls back to when its image is removed: the style's text slide. */
export function layoutWithoutImage(style: VisualStyle): LayoutId {
  return STYLE_LOOKS[style].text;
}
