import type { VisualStyle } from './brandKit';
import type { ContentType, Objective, SlideCountOption, SlideRole } from './content';
import type { LayoutId } from './layouts';
import type { Metrics } from './metrics';
import { shadeOf, type ImageShade } from './shade';

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

export const PLATFORMS = ['instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok' };
export const PLATFORM_FORMATS: Record<Platform, CarouselFormat> = { instagram: '4:5', tiktok: '9:16' };

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
  /** Library folders the images come from. Empty means every folder. */
  folders: string[];
  copyMode?: CopyMode;
  /** Darkening over every photo. Older carousels have none. */
  shade?: ImageShade;
}

export type CopyMode = 'manual' | 'ai';

/** Links the variants of one format test. */
export interface ExperimentRef {
  id: string;
  name: string;
  variant: string;
}

export interface Carousel {
  id: string;
  brandKitId: string;
  title: string;
  status: CarouselStatus;
  format: CarouselFormat;
  source: CarouselSource;
  slides: Slide[];
  caption: string;
  experiment: ExperimentRef | null;
  metrics: Metrics | null;
  createdAt: string;
  updatedAt: string;
}

export type CarouselInput = Omit<Carousel, 'id' | 'createdAt' | 'updatedAt'>;

/** Title size range in the editor, relative to the brand kit size. */
export const FONT_SCALE_RANGE = { min: 0.3, max: 1.6, step: 0.05 } as const;

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

/** Fills fields added after the first release so older saved carousels keep working. */
export function normalizeCarousel(carousel: Carousel): Carousel {
  return {
    ...carousel,
    caption: carousel.caption ?? '',
    experiment: carousel.experiment ?? null,
    metrics: carousel.metrics ?? null,
    source: { ...carousel.source, folders: carousel.source.folders ?? [], shade: shadeOf(carousel.source) },
  };
}
