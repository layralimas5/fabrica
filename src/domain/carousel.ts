import type { VisualStyle } from './brandKit';
import { CONTENT_CATEGORIES, deriveCategory, type ContentCategory, type ContentType, type Objective, type SlideCountOption, type SlideRole } from './content';
import type { LayoutId } from './layouts';
import type { Metrics } from './metrics';
import { shadeOf, type ImageShade } from './shade';
import type { ContentOrigin } from './winners/record';

export interface SlideStyle {
  fontScale: number;
  /** Share of the default text width, 1 = full width. Narrower text breaks into more, shorter lines. */
  textWidth: number;
  /** Multiplies the default space between lines. */
  lineHeight: number;
  offsetX: number;
  offsetY: number;
  headingFont: string | null;
}

export const CARD_POSITIONS = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const;
export type CardPosition = (typeof CARD_POSITIONS)[number];
export const CARD_POSITION_LABELS: Record<CardPosition, string> = {
  'top-left': 'Em cima, à esquerda',
  'top-right': 'Em cima, à direita',
  center: 'No centro',
  'bottom-left': 'Embaixo, à esquerda',
  'bottom-right': 'Embaixo, à direita',
};

/** Share of the slide width the card takes. */
export const CARD_SIZE_RANGE = { min: 0.25, max: 0.9, step: 0.05 } as const;

/**
 * A cut-out of the app floating over the slide (rounded, with shadow), like a screenshot pasted on a photo.
 * The slide keeps its own photo as the background and its text.
 */
export interface SlideCard {
  assetId: string;
  position: CardPosition;
  size: number;
}

export const DEFAULT_CARD: Omit<SlideCard, 'assetId'> = { position: 'top-left', size: 0.48 };

/** How the product slide shows the app: the print filling the slide, or a cut-out over a photo. */
export const PRODUCT_DISPLAYS = ['full', 'card'] as const;
export type ProductDisplay = (typeof PRODUCT_DISPLAYS)[number];
export const PRODUCT_DISPLAY_LABELS: Record<ProductDisplay, { title: string; detail: string }> = {
  full: { title: 'Print em tela cheia', detail: 'A imagem do app ocupa o slide' },
  card: { title: 'Recorte sobre uma foto', detail: 'Foto de fundo, o app num card e o texto por cima' },
};

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
  /** App cut-out drawn over the slide. Missing in slides saved before cards existed. */
  card?: SlideCard | null;
}

export const CAROUSEL_STATUSES = ['draft', 'editing', 'ready', 'published', 'analyzing', 'winner', 'weak', 'archived'] as const;
export type CarouselStatus = (typeof CAROUSEL_STATUSES)[number];

export const STATUS_LABELS: Record<CarouselStatus, string> = {
  draft: 'Rascunho',
  editing: 'Em produção',
  ready: 'Pronto',
  published: 'Publicado',
  analyzing: 'Em análise',
  winner: 'Vencedor',
  weak: 'Fraco',
  archived: 'Arquivado',
};

export const STATUS_TONES: Record<CarouselStatus, 'neutral' | 'accent' | 'success' | 'warning'> = {
  draft: 'neutral',
  editing: 'warning',
  ready: 'accent',
  published: 'success',
  analyzing: 'accent',
  winner: 'success',
  weak: 'warning',
  archived: 'neutral',
};

/** Statuses of a carousel that already went out: after posting it is analysed and classified. */
const POSTED_STATUSES: CarouselStatus[] = ['published', 'analyzing', 'winner', 'weak'];

/** Not posted yet but with a day set: shown as "Agendado" without being a stored status. */
export function isScheduled(carousel: Pick<Carousel, 'status' | 'scheduledFor'>): boolean {
  return Boolean(carousel.scheduledFor) && (carousel.status === 'draft' || carousel.status === 'editing' || carousel.status === 'ready');
}

export function statusLabel(carousel: Pick<Carousel, 'status' | 'scheduledFor'>): string {
  return isScheduled(carousel) ? 'Agendado' : STATUS_LABELS[carousel.status];
}

export function isPosted(carousel: Pick<Carousel, 'status'>): boolean {
  return POSTED_STATUSES.includes(carousel.status);
}

/** Marking as posted is reversible: undoing goes back to "Pronto", the step right before posting. */
export function postedStatus(posted: boolean): CarouselStatus {
  return posted ? 'published' : 'ready';
}

/**
 * Next carousel to review in the same batch (same project and folder, creation order) that was not saved
 * or posted yet. Null when the batch is done.
 */
export function nextToReview(current: Carousel, carousels: Carousel[]): Carousel | null {
  const batch = carousels
    .filter((item) => item.project === current.project && item.folder === current.folder)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const position = batch.findIndex((item) => item.id === current.id);
  const pending = (item: Carousel) => item.id !== current.id && (item.status === 'draft' || item.status === 'editing');
  return batch.slice(position + 1).find(pending) ?? batch.slice(0, Math.max(0, position)).find(pending) ?? null;
}

export const CAROUSEL_FORMATS = ['4:5', '3:4', '1:1', '9:16'] as const;
export type CarouselFormat = (typeof CAROUSEL_FORMATS)[number];

export const FORMAT_SIZES: Record<CarouselFormat, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

export const PLATFORMS = ['instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok' };

interface FormatOption {
  format: CarouselFormat;
  use: string;
}

/** Proportions each network accepts, the recommended one first. */
export const PLATFORM_FORMAT_OPTIONS: Record<Platform, FormatOption[]> = {
  instagram: [
    { format: '4:5', use: 'Feed (recomendado)' },
    { format: '3:4', use: 'Grade nova do perfil' },
    { format: '1:1', use: 'Quadrado' },
    { format: '9:16', use: 'Stories e Reels' },
  ],
  tiktok: [
    { format: '9:16', use: 'Tela cheia (recomendado)' },
    { format: '3:4', use: 'Foto vertical' },
    { format: '1:1', use: 'Quadrado' },
  ],
};

export function defaultFormatFor(platform: Platform): CarouselFormat {
  return PLATFORM_FORMAT_OPTIONS[platform][0].format;
}

export function formatFitsPlatform(format: CarouselFormat, platform: Platform): boolean {
  return PLATFORM_FORMAT_OPTIONS[platform].some((option) => option.format === format);
}

export function formatSizeLabel(format: CarouselFormat): string {
  const { width, height } = FORMAT_SIZES[format];
  return `${width}×${height}`;
}

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
  /** Account shown in the post-style header. */
  accountId?: string | null;
  /** What the carousel is about, e.g. "constância". */
  theme?: string;
  /** Free labels crossed with performance in Analytics, e.g. "identificação", "ugc". */
  tags?: string[];
  /** Editorial category; derived from the objective and type when never picked. */
  category?: ContentCategory;
  /** Posting time 'HH:MM', set on the calendar. */
  scheduledTime?: string | null;
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
  /** Where it is filed in Projetos, e.g. project "Aura", folder "Outubro". Empty means unfiled. */
  project: string;
  folder: string;
  /** Day it should be posted ('YYYY-MM-DD'), or null when not scheduled. */
  scheduledFor: string | null;
  /** Winner it was created from (as a model, a variation or part of a family), or null. */
  origin: ContentOrigin | null;
  createdAt: string;
  updatedAt: string;
}

export type CarouselInput = Omit<Carousel, 'id' | 'createdAt' | 'updatedAt'>;

/** Title size range in the editor, relative to the brand kit size. */
/** Carousel-wide text shape: the same on every slide. */
export type TextStyle = Pick<SlideStyle, 'fontScale' | 'textWidth' | 'lineHeight'>;

export const FONT_SCALE_RANGE = { min: 0.3, max: 1.6, step: 0.05 } as const;
export const TEXT_WIDTH_RANGE = { min: 0.4, max: 1, step: 0.05 } as const;
export const LINE_HEIGHT_RANGE = { min: 0.8, max: 2, step: 0.05 } as const;

export const DEFAULT_SLIDE_STYLE: SlideStyle = { fontScale: 1, textWidth: 1, lineHeight: 1, offsetX: 0, offsetY: 0, headingFont: null };
export const DEFAULT_TEXT_STYLE: TextStyle = { fontScale: 1, textWidth: 1, lineHeight: 1 };

const clampTo = (range: { min: number; max: number }, value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;

/** Keeps a stored text style inside the ranges the editor offers. */
export function normalizeTextStyle(raw: Partial<TextStyle> | undefined): TextStyle {
  return {
    fontScale: clampTo(FONT_SCALE_RANGE, raw?.fontScale, 1),
    textWidth: clampTo(TEXT_WIDTH_RANGE, raw?.textWidth, 1),
    lineHeight: clampTo(LINE_HEIGHT_RANGE, raw?.lineHeight, 1),
  };
}

export function categoryOf(source: Pick<CarouselSource, 'category' | 'contentType' | 'objective'>): ContentCategory {
  return source.category && CONTENT_CATEGORIES.includes(source.category) ? source.category : deriveCategory(source.contentType, source.objective);
}

/** 'HH:MM' in 24h, or null. */
export function normalizeTime(raw: unknown): string | null {
  return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
}

export const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

/** "#Dor, identificação ,dor" → ["dor", "identificação"]: lowercase, no #, no repeats. */
export function normalizeTags(raw: string[] | string): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,\n]/);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const tag = part.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}

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
  return { ...slide, id: newSlideId(), bullets: [...slide.bullets], style: { ...slide.style }, card: slide.card ? { ...slide.card } : null };
}

const clampCardSize = (value: unknown) => clampTo(CARD_SIZE_RANGE, value, DEFAULT_CARD.size);

export function normalizeCard(raw: Partial<SlideCard> | null | undefined): SlideCard | null {
  if (!raw || typeof raw.assetId !== 'string' || !raw.assetId) return null;
  const position = CARD_POSITIONS.includes(raw.position as CardPosition) ? (raw.position as CardPosition) : DEFAULT_CARD.position;
  return { assetId: raw.assetId, position, size: clampCardSize(raw.size) };
}

/** Full-screen print → cut-out: the print becomes the card and the slide waits for a background photo. */
export function toCardSlide(slide: Slide): Pick<Slide, 'assetId' | 'card'> {
  if (slide.card || !slide.assetId) return { assetId: slide.assetId, card: slide.card ?? null };
  return { assetId: null, card: { assetId: slide.assetId, ...DEFAULT_CARD } };
}

/** Cut-out → full screen: the card image fills the slide again. */
export function toFullSlide(slide: Slide): Pick<Slide, 'assetId' | 'card'> {
  return slide.card ? { assetId: slide.card.assetId, card: null } : { assetId: slide.assetId, card: null };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export function toCarouselInput(carousel: Carousel): CarouselInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = carousel;
  return input;
}

/** Fills fields added after the first release so older saved carousels keep working. */
export function normalizeCarousel(carousel: Carousel): Carousel {
  return {
    ...carousel,
    caption: carousel.caption ?? '',
    experiment: carousel.experiment ?? null,
    metrics: carousel.metrics ?? null,
    project: carousel.project ?? '',
    folder: carousel.folder ?? '',
    scheduledFor: carousel.scheduledFor ?? null,
    origin: carousel.origin ?? null,
    status: CAROUSEL_STATUSES.includes(carousel.status) ? carousel.status : 'draft',
    source: { ...carousel.source, folders: carousel.source.folders ?? [], shade: shadeOf(carousel.source), theme: carousel.source.theme ?? '', tags: normalizeTags(carousel.source.tags ?? []), category: categoryOf(carousel.source), scheduledTime: normalizeTime(carousel.source.scheduledTime) },
    slides: carousel.slides.map((slide) => ({ ...slide, style: { ...DEFAULT_SLIDE_STYLE, ...slide.style }, card: normalizeCard(slide.card) })),
  };
}
