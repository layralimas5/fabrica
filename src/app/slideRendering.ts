import type { AssetRepository } from '../application/ports';
import type { Asset } from '../domain/asset';
import type { BrandKit, VisualStyle } from '../domain/brandKit';
import type { CarouselFormat, Slide } from '../domain/carousel';
import { resolveTheme } from '../domain/theme';
import { renderSlideToCanvas } from '../render/renderSlide';
import { bitmapOf } from './imageCache';

/** Everything a slide needs to render besides its own content. Kept small so it stays referentially stable while editing. */
export interface RenderContext {
  brand: BrandKit;
  assets: Asset[];
  repo: AssetRepository;
  format: CarouselFormat;
  visualStyle: VisualStyle;
  total: number;
}

async function optionalBitmap(context: RenderContext, assetId: string | null): Promise<ImageBitmap | null> {
  const asset = assetId ? context.assets.find((item) => item.id === assetId) : undefined;
  if (!asset) return null;
  try {
    return await bitmapOf(context.repo, asset);
  } catch (error) {
    console.warn(`Imagem ${asset.name} indisponível; slide renderizado sem ela.`, error);
    return null;
  }
}

export async function renderCarouselSlide(context: RenderContext, slide: Slide, index: number, scale: number): Promise<HTMLCanvasElement> {
  const [image, logo, avatar] = await Promise.all([
    optionalBitmap(context, slide.assetId),
    optionalBitmap(context, context.brand.logoAssetId),
    optionalBitmap(context, context.brand.avatarAssetId ?? null),
  ]);
  return renderSlideToCanvas(
    { slide, theme: resolveTheme(context.brand, context.visualStyle), format: context.format, index, total: context.total, image, logo, avatar },
    scale,
  );
}
