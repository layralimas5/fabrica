import type { Account } from '../domain/account';
import { productOf, VISUAL_STYLES, type BrandKit, type VisualStyle } from '../domain/brandKit';
import { CAROUSEL_FORMATS, PLATFORMS, type Carousel, type CarouselFormat, type Platform } from '../domain/carousel';
import type { ContentOrigin, ContentRecord } from '../domain/winners/record';
import { cleanThemes, type RemixBrand, type RemixRequest } from '../domain/winners/remix';
import { brandContext } from './brandContext';

/** What "Usar como modelo", "Criar variações" and "Família" hand to the create screen. */
export interface CreateHandoff {
  copies: string[];
  origin: ContentOrigin;
  settings: {
    platform: Platform | null;
    format: CarouselFormat | null;
    accountId: string | null;
    brandKitId: string | null;
    /** Only when the visual identity is kept. */
    style: VisualStyle | null;
  };
}

export interface WinnerContext {
  carousel: Carousel | null;
  account: Account | null;
  brand: BrandKit | null;
}

/** The winner's carousel, account and brand, whichever exist. */
export function winnerContext(record: ContentRecord, carousels: Carousel[], accounts: Account[], brands: BrandKit[]): WinnerContext {
  const carousel = record.carouselId ? (carousels.find((item) => item.id === record.carouselId) ?? null) : null;
  const account = accounts.find((item) => item.id === (record.accountId ?? carousel?.source.accountId)) ?? null;
  const brandId = carousel?.brandKitId ?? account?.brandKitId ?? null;
  return { carousel, account, brand: brands.find((kit) => kit.id === brandId) ?? null };
}

export function remixBrand(brand: BrandKit | null): RemixBrand | null {
  if (!brand) return null;
  const product = productOf(brand);
  return { name: brand.name, voice: brandContext(brand).voice, product: product ? { name: product.name.trim(), pitch: product.pitch.trim() } : null };
}

export function buildHandoff(record: ContentRecord, context: WinnerContext, request: RemixRequest, copies: string[]): CreateHandoff {
  const platform = context.account?.platform ?? (record.platform === 'outros' ? null : record.platform);
  const keepVisual = request.keep.includes('visualIdentity');
  return {
    copies,
    origin: {
      modelId: record.id,
      modelTitle: record.title,
      kind: request.mode === 'variations' ? 'variation' : request.mode,
      family: request.mode === 'family' ? request.familyName.trim() || `Família: ${cleanThemes(request.themes).slice(0, 3).join(', ')}` : null,
    },
    settings: {
      platform,
      format: keepVisual ? (context.carousel?.format ?? null) : null,
      accountId: context.account?.id ?? null,
      brandKitId: context.brand?.id ?? null,
      style: keepVisual ? (context.carousel?.source.visualStyle ?? null) : null,
    },
  };
}

const isOneOf = <T extends string>(allowed: readonly T[], value: unknown): value is T => allowed.includes(value as T);

/** Router state can be anything (a reload, an old link): only a complete handoff is used. */
export function readHandoff(state: unknown): CreateHandoff | null {
  if (!state || typeof state !== 'object' || !('handoff' in state)) return null;
  const handoff = (state as { handoff: unknown }).handoff as Partial<CreateHandoff> | null;
  if (!handoff || !Array.isArray(handoff.copies) || !handoff.copies.every((copy) => typeof copy === 'string')) return null;
  const origin = handoff.origin;
  if (!origin || typeof origin.modelId !== 'string' || typeof origin.modelTitle !== 'string') return null;
  const settings = handoff.settings;
  return {
    copies: handoff.copies,
    origin: { modelId: origin.modelId, modelTitle: origin.modelTitle, kind: isOneOf(['model', 'variation', 'family'] as const, origin.kind) ? origin.kind : 'model', family: typeof origin.family === 'string' ? origin.family : null },
    settings: {
      platform: isOneOf(PLATFORMS, settings?.platform) ? settings.platform : null,
      format: isOneOf(CAROUSEL_FORMATS, settings?.format) ? settings.format : null,
      accountId: typeof settings?.accountId === 'string' ? settings.accountId : null,
      brandKitId: typeof settings?.brandKitId === 'string' ? settings.brandKitId : null,
      style: isOneOf(VISUAL_STYLES, settings?.style) ? settings.style : null,
    },
  };
}
