import type { AssetRepository } from '../application/ports';
import type { AccountIdentity } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit, VisualStyle } from '../domain/brandKit';
import type { CarouselFormat, Slide } from '../domain/carousel';
import type { ImageShade } from '../domain/shade';
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
  shade: ImageShade;
  /** Account shown in the post-style header; falls back to the brand name and profile photo. */
  account?: AccountIdentity | null;
}

const dataUrlBitmaps = new Map<string, Promise<ImageBitmap>>();

/** Account photos are small data URLs; decode each once. */
function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap | null> {
  let pending = dataUrlBitmaps.get(dataUrl);
  if (!pending) {
    pending = fetch(dataUrl)
      .then((response) => response.blob())
      .then((blob) => createImageBitmap(blob));
    pending.catch(() => dataUrlBitmaps.delete(dataUrl));
    dataUrlBitmaps.set(dataUrl, pending);
  }
  return pending.catch((error: unknown) => {
    console.warn('Foto da conta indisponível; cabeçalho com a inicial.', error);
    return null;
  });
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
    context.account?.avatar ? bitmapFromDataUrl(context.account.avatar) : optionalBitmap(context, context.brand.avatarAssetId ?? null),
  ]);
  const identity = context.account?.name ? { name: context.account.name, handle: context.account.handle } : { name: context.brand.name, handle: '' };
  return renderSlideToCanvas(
    { slide, theme: resolveTheme(context.brand, context.visualStyle), format: context.format, index, total: context.total, image, logo, avatar, shade: context.shade, identity },
    scale,
  );
}
