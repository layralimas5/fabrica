import { VISUAL_STYLES, type VisualStyle } from './brandKit';
import { CAROUSEL_FORMATS, PLATFORMS, type CarouselFormat, type CopyMode, type Platform } from './carousel';
import { CONTENT_TYPES, OBJECTIVES, SLIDE_COUNT_OPTIONS, type ContentType, type Objective, type SlideCountOption } from './content';
import { MAX_PER_DAY } from './schedule';
import { DEFAULT_SHADE, SHADE_STYLES, type ImageShade } from './shade';

/** Everything chosen on the create screen except the copy itself, so a batch can be produced the same way every time. */
export interface CreateSettings {
  platform: Platform;
  format: CarouselFormat;
  accountId: string | null;
  mode: CopyMode;
  brandKitId: string | null;
  objective: Objective;
  contentType: ContentType;
  slideCount: SlideCountOption;
  styles: VisualStyle[];
  postWithImages: boolean;
  shade: ImageShade;
  folders: string[];
  includeProduct: boolean;
  addCta: boolean;
  project: string;
  folder: string;
  scheduling: boolean;
  perDay: number;
}

export interface Preset {
  id: string;
  name: string;
  settings: CreateSettings;
  createdAt: string;
  updatedAt: string;
}

export type PresetInput = Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>;

export const MAX_PRESET_NAME = 60;

export const DEFAULT_CREATE_SETTINGS: CreateSettings = {
  platform: 'instagram',
  format: '4:5',
  accountId: null,
  mode: 'manual',
  brandKitId: null,
  objective: 'engajamento',
  contentType: 'auto',
  slideCount: 'auto',
  styles: ['minimalista'],
  postWithImages: true,
  shade: DEFAULT_SHADE,
  folders: [],
  includeProduct: true,
  addCta: false,
  project: '',
  folder: '',
  scheduling: false,
  perDay: 1,
};

const oneOf = <T extends string | number>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/**
 * Settings read back from storage: unknown or missing values fall back to defaults,
 * so presets saved by older versions still apply cleanly.
 */
export function normalizeSettings(raw: Partial<CreateSettings>): CreateSettings {
  const base = DEFAULT_CREATE_SETTINGS;
  const styles = (raw.styles ?? []).filter((style): style is VisualStyle => VISUAL_STYLES.includes(style));
  const shade = raw.shade && SHADE_STYLES.includes(raw.shade.style) ? raw.shade : base.shade;
  return {
    platform: oneOf(PLATFORMS, raw.platform, base.platform),
    format: oneOf(CAROUSEL_FORMATS, raw.format, base.format),
    accountId: raw.accountId ?? null,
    mode: raw.mode === 'ai' ? 'ai' : 'manual',
    brandKitId: raw.brandKitId ?? null,
    objective: oneOf(OBJECTIVES, raw.objective, base.objective),
    contentType: oneOf(CONTENT_TYPES, raw.contentType, base.contentType),
    slideCount: oneOf(SLIDE_COUNT_OPTIONS, raw.slideCount, base.slideCount),
    styles: styles.length > 0 ? styles : base.styles,
    postWithImages: raw.postWithImages ?? base.postWithImages,
    shade,
    folders: Array.isArray(raw.folders) ? raw.folders : base.folders,
    includeProduct: raw.includeProduct ?? base.includeProduct,
    addCta: raw.addCta ?? base.addCta,
    project: raw.project ?? base.project,
    folder: raw.folder ?? base.folder,
    scheduling: raw.scheduling ?? base.scheduling,
    perDay: Math.min(MAX_PER_DAY, Math.max(1, Math.floor(raw.perDay ?? base.perDay))),
  };
}
