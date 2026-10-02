import { z } from 'zod';
import { VISUAL_STYLES } from './brandKit';
import { CONTENT_TYPES, OBJECTIVES, SLIDE_ROLES } from './content';
import { LAYOUT_IDS } from './layouts';

/**
 * Wire contract between the app and the AI engine (Edge Function or local heuristic).
 * Mirrored in supabase/functions/_shared/contract.ts — keep both in sync.
 */

export const slideDraftSchema = z.object({
  role: z.enum(SLIDE_ROLES),
  title: z.string(),
  subtitle: z.string().nullable(),
  body: z.string().nullable(),
  bullets: z.array(z.string()),
  assetId: z.string().nullable(),
  layout: z.enum(LAYOUT_IDS).nullable(),
  wantsImage: z.boolean(),
});
export type SlideDraft = z.infer<typeof slideDraftSchema>;

export const carouselDraftSchema = z.object({
  title: z.string(),
  caption: z.string(),
  slides: z.array(slideDraftSchema).min(1),
});
export type CarouselDraft = z.infer<typeof carouselDraftSchema>;

export const brandContextSchema = z.object({
  name: z.string(),
  handle: z.string(),
  voice: z.string(),
  visualStyle: z.enum(VISUAL_STYLES),
});
export type BrandContext = z.infer<typeof brandContextSchema>;

export const assetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  folder: z.string(),
  kind: z.string(),
  tags: z.array(z.string()),
});
export type AssetSummary = z.infer<typeof assetSummarySchema>;

export const productContextSchema = z.object({
  name: z.string().min(1).max(80),
  pitch: z.string().max(1000),
  hasImage: z.boolean(),
});
export type ProductContext = z.infer<typeof productContextSchema>;

export const draftRequestSchema = z.object({
  copy: z.string().min(1).max(20000),
  contentType: z.enum(CONTENT_TYPES),
  objective: z.enum(OBJECTIVES),
  visualStyle: z.enum(VISUAL_STYLES),
  slideCount: z.number().int().min(3).max(12).nullable(),
  brand: brandContextSchema,
  /** Null when the carousel should not show a product. */
  product: productContextSchema.nullable(),
  assets: z.array(assetSummarySchema).max(400),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const slideTextSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  body: z.string().nullable(),
  bullets: z.array(z.string()),
});
export type SlideText = z.infer<typeof slideTextSchema>;

export const rewriteRequestSchema = z.object({
  mode: z.enum(['shorten', 'variation']),
  role: z.enum(SLIDE_ROLES),
  slide: slideTextSchema,
  copy: z.string().max(20000),
  brand: brandContextSchema,
});
export type RewriteRequest = z.infer<typeof rewriteRequestSchema>;

export const hooksRequestSchema = z.object({
  hook: z.string().min(1),
  copy: z.string().max(20000),
  brand: brandContextSchema,
  count: z.number().int().min(1).max(10),
});
export type HooksRequest = z.infer<typeof hooksRequestSchema>;

export const hooksResponseSchema = z.object({ hooks: z.array(z.string()).min(1) });

/** About 1.5 MB of JPEG once base64-encoded; the client downsizes photos before sending. */
export const MAX_AI_IMAGE_CHARS = 2_000_000;

export const tagImageRequestSchema = z.object({
  image: z.string().min(1).max(MAX_AI_IMAGE_CHARS),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  /** File name and folder, which often say what the photo is about. */
  hint: z.string().max(300),
});
export type TagImageRequest = z.infer<typeof tagImageRequestSchema>;

export const tagImageResponseSchema = z.object({ tags: z.array(z.string()) });

export const matchRequestSchema = z.object({
  slides: z.array(z.object({ text: z.string().max(2000) })).min(1).max(12),
  assets: z.array(assetSummarySchema).min(1).max(400),
});
export type MatchRequest = z.infer<typeof matchRequestSchema>;

/** One entry per slide: the photo that fits it, or null when no photo fits. */
export const matchResponseSchema = z.object({ assetIds: z.array(z.string().nullable()) });
