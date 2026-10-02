import type { AssetRepository } from '../application/ports';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import { identityOf, type Account } from '../domain/account';
import type { Carousel } from '../domain/carousel';
import { shadeOf } from '../domain/shade';
import type { RenderContext } from './slideRendering';

export function renderContextFor(carousel: Carousel, brand: BrandKit, assets: Asset[], repo: AssetRepository, accounts: Account[] = []): RenderContext {
  const account = accounts.find((item) => item.id === carousel.source.accountId);
  return { brand, assets, repo, format: carousel.format, visualStyle: carousel.source.visualStyle, total: carousel.slides.length, shade: shadeOf(carousel.source), account: account ? identityOf(account) : null };
}
