// Mirror of src/domain/aiContract.ts for the Deno runtime. Keep both in sync.
import { z } from 'npm:zod@4';

export const SLIDE_ROLES = [
  'hook', 'context', 'situation', 'identification', 'problem', 'consequence', 'point', 'item', 'step',
  'mistake', 'belief', 'argument', 'example', 'story', 'insight', 'solution', 'product', 'summary', 'conclusion', 'cta',
] as const;
export const LAYOUT_IDS = [
  'text_center', 'big_statement', 'image_full_quote', 'image_top_text_bottom', 'image_left_text_right', 'text_side', 'list', 'cta',
  'post_image', 'post_text', 'native_photo',
] as const;
const CONTENT_TYPES = ['auto', 'dor', 'educativo', 'lista', 'tutorial', 'storytelling', 'contrarian', 'erros', 'framework', 'manifesto', 'transformacao'] as const;
const OBJECTIVES = ['engajamento', 'compartilhamento', 'salvamento', 'educacao', 'conversao', 'autoridade'] as const;
const VISUAL_STYLES = ['minimalista', 'editorial', 'clean', 'bold', 'dark', 'lifestyle', 'post', 'tiktok'] as const;

const brand = z.object({ name: z.string(), handle: z.string(), voice: z.string(), visualStyle: z.enum(VISUAL_STYLES) });
const slideText = z.object({ title: z.string(), subtitle: z.string().nullable(), body: z.string().nullable(), bullets: z.array(z.string()) });

export const draftRequest = z.object({
  copy: z.string().min(1).max(20000),
  contentType: z.enum(CONTENT_TYPES),
  objective: z.enum(OBJECTIVES),
  visualStyle: z.enum(VISUAL_STYLES),
  slideCount: z.number().int().min(3).max(12).nullable(),
  brand,
  product: z.object({ name: z.string().min(1).max(80), pitch: z.string().max(1000), hasImage: z.boolean() }).nullable(),
  assets: z.array(z.object({ id: z.string(), name: z.string(), folder: z.string(), kind: z.string(), tags: z.array(z.string()) })).max(400),
});

export const rewriteRequest = z.object({
  mode: z.enum(['shorten', 'variation']),
  role: z.enum(SLIDE_ROLES),
  slide: slideText,
  copy: z.string().max(20000),
  brand,
});

const assetSummary = z.object({ id: z.string(), name: z.string(), folder: z.string(), kind: z.string(), tags: z.array(z.string()) });

export const tagImageRequest = z.object({
  image: z.string().min(1).max(2_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  hint: z.string().max(300),
});

export const matchRequest = z.object({
  slides: z.array(z.object({ text: z.string().max(2000) })).min(1).max(12),
  assets: z.array(assetSummary).min(1).max(400),
});

export const hooksRequest = z.object({ hook: z.string().min(1), copy: z.string().max(20000), brand, count: z.number().int().min(1).max(10) });

export const draftResponse = z.object({
  title: z.string(),
  caption: z.string(),
  slides: z.array(
    slideText.extend({
      role: z.enum(SLIDE_ROLES),
      assetId: z.string().nullable(),
      layout: z.enum(LAYOUT_IDS).nullable(),
      wantsImage: z.boolean(),
    }),
  ).min(1),
});
export const rewriteResponse = slideText;
export const hooksResponse = z.object({ hooks: z.array(z.string()).min(1) });
export const tagImageResponse = z.object({ tags: z.array(z.string()) });
export const matchResponse = z.object({ assetIds: z.array(z.string().nullable()) });

const nullableString = { type: ['string', 'null'] };
const slideTextProperties = {
  title: { type: 'string' },
  subtitle: nullableString,
  body: nullableString,
  bullets: { type: 'array', items: { type: 'string' } },
};

/** JSON Schemas handed to Claude's structured outputs. */
export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'caption', 'slides'],
  properties: {
    title: { type: 'string' },
    caption: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'title', 'subtitle', 'body', 'bullets', 'assetId', 'layout', 'wantsImage'],
        properties: {
          role: { type: 'string', enum: SLIDE_ROLES },
          ...slideTextProperties,
          assetId: nullableString,
          layout: { type: ['string', 'null'], enum: [...LAYOUT_IDS, null] },
          wantsImage: { type: 'boolean' },
        },
      },
    },
  },
};

export const SLIDE_TEXT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subtitle', 'body', 'bullets'],
  properties: slideTextProperties,
};

export const HOOKS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hooks'],
  properties: { hooks: { type: 'array', items: { type: 'string' } } },
};

export const TAGS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tags'],
  properties: { tags: { type: 'array', items: { type: 'string' } } },
};

export const MATCH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assetIds'],
  properties: { assetIds: { type: 'array', items: { type: ['string', 'null'] } } },
};
