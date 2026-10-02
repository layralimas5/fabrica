import type { BrandContext } from '../domain/aiContract';
import type { BrandKit } from '../domain/brandKit';

export function brandContext(brand: BrandKit): BrandContext {
  return { name: brand.name, handle: brand.handle, voice: brand.voice, visualStyle: brand.visualStyle };
}
