import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel, CarouselSource } from '../domain/carousel';
import { composeSlides } from '../domain/composeCarousel';
import type { BrandContext } from '../domain/aiContract';
import type { Services } from './ports';

const ASSET_CONTEXT_LIMIT = 400;

export function brandContext(brand: BrandKit): BrandContext {
  return { name: brand.name, handle: brand.handle, voice: brand.voice, visualStyle: brand.visualStyle };
}

export async function generateCarousel(services: Services, brand: BrandKit, source: CarouselSource, library: Asset[]): Promise<Carousel> {
  const brandOnly = new Set([brand.logoAssetId, brand.avatarAssetId].filter(Boolean));
  const assets = library.filter((asset) => !brandOnly.has(asset.id));
  const draft = await services.ai.draftCarousel({
    copy: source.copy,
    contentType: source.contentType,
    objective: source.objective,
    visualStyle: source.visualStyle,
    slideCount: source.slideCount === 'auto' ? null : source.slideCount,
    brand: brandContext(brand),
    assets: assets.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
  });

  const slides = composeSlides(draft, { objective: source.objective, assets, visualStyle: source.visualStyle });
  return services.carousels.create({
    brandKitId: brand.id,
    title: draft.title || slides[0].title,
    status: 'draft',
    format: '4:5',
    source,
    slides,
  });
}
