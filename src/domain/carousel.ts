import type { VisualStyle } from './brandKit';
import type { ContentType, Objective, SlideCountOption, SlideRole } from './content';
import type { LayoutId } from './layouts';

export interface SlideStyle {
  fontScale: number;
  offsetX: number;
  offsetY: number;
  headingFont: string | null;
}

export interface Slide {
  id: string;
  role: SlideRole;
  title: string;
  subtitle: string | null;
  body: string | null;
  bullets: string[];
  assetId: string | null;
  layout: LayoutId;
  style: SlideStyle;
}

export const CAROUSEL_STATUSES = ['draft', 'editing', 'ready', 'published'] as const;
export type CarouselStatus = (typeof CAROUSEL_STATUSES)[number];

export const STATUS_LABELS: Record<CarouselStatus, string> = {
  draft: 'Rascunho',
  editing: 'Em edição',
  ready: 'Pronto',
  published: 'Publicado',
};

export type CarouselFormat = '4:5' | '9:16';

export const FORMAT_SIZES: Record<CarouselFormat, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
};

export interface CarouselSource {
  copy: string;
  contentType: ContentType;
  objective: Objective;
  visualStyle: VisualStyle;
  slideCount: SlideCountOption;
}

export interface Carousel {
  id: string;
  brandKitId: string;
  title: string;
  status: CarouselStatus;
  format: CarouselFormat;
  source: CarouselSource;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
}

export type CarouselInput = Omit<Carousel, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_SLIDE_STYLE: SlideStyle = { fontScale: 1, offsetX: 0, offsetY: 0, headingFont: null };

export function newSlideId(): string {
  return crypto.randomUUID();
}

export function blankSlide(layout: LayoutId = 'text_center'): Slide {
  return {
    id: newSlideId(),
    role: 'point',
    title: 'Novo slide',
    subtitle: null,
    body: null,
    bullets: [],
    assetId: null,
    layout,
    style: { ...DEFAULT_SLIDE_STYLE },
  };
}

export function duplicateSlide(slide: Slide): Slide {
  return { ...slide, id: newSlideId(), bullets: [...slide.bullets], style: { ...slide.style } };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}
