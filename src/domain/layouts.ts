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
};

const ROLE_PREFERENCES: Partial<Record<SlideRole, LayoutId[]>> = {
  hook: ['image_full_quote', 'text_center', 'big_statement'],
  belief: ['big_statement', 'text_center'],
  insight: ['big_statement', 'text_center'],
  conclusion: ['text_center', 'big_statement'],
  summary: ['list', 'text_side'],
  cta: ['cta'],
};

const ROTATION: LayoutId[] = ['image_top_text_bottom', 'text_side', 'image_left_text_right', 'image_full_quote', 'text_center'];

interface LayoutCandidate {
  role: SlideRole;
  hasBullets: boolean;
  hasImage: boolean;
  suggested?: LayoutId | null;
}

/** Picks one layout per slide, keeping visual rhythm (no two neighbours alike, images only where available). */
export function assignLayouts(slides: LayoutCandidate[]): LayoutId[] {
  const result: LayoutId[] = [];
  let rotationIndex = 0;

  slides.forEach((slide, index) => {
    const previous = result[index - 1];
    const usable = (layout: LayoutId) => (LAYOUTS[layout].needsImage && !slide.hasImage ? LAYOUTS[layout].textOnlyFallback : layout);

    const preferences: LayoutId[] = [];
    if (slide.suggested) preferences.push(slide.suggested);
    if (slide.hasBullets) preferences.push('list');
    preferences.push(...(ROLE_PREFERENCES[slide.role] ?? []));
    for (let i = 0; i < ROTATION.length; i++) preferences.push(ROTATION[(rotationIndex + i) % ROTATION.length]);

    const chosen = preferences.map(usable).find((layout) => layout !== previous || layout === 'cta') ?? usable(preferences[0]);
    if (ROTATION.includes(chosen)) rotationIndex = (ROTATION.indexOf(chosen) + 1) % ROTATION.length;
    result.push(chosen);
  });

  return result;
}

/** Layouts a slide can switch to. Lists accept any slide: body sentences become items when there are no bullets. */
export function compatibleLayouts(hasImage: boolean): LayoutId[] {
  return LAYOUT_IDS.filter((id) => hasImage || !LAYOUTS[id].needsImage);
}
