import type { AssetRepository } from '../application/ports';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import type { RenderContext } from './slideRendering';

export function renderContextFor(carousel: Carousel, brand: BrandKit, assets: Asset[], repo: AssetRepository): RenderContext {
  return { brand, assets, repo, format: carousel.format, visualStyle: carousel.source.visualStyle, total: carousel.slides.length };
}
