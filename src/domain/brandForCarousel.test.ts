import { describe, expect, it } from 'vitest';
import { brandForCarousel, defaultBrandKit, type BrandKit } from './brandKit';

const kit = (id: string): BrandKit => ({ ...defaultBrandKit({ name: id }), id, createdAt: '', updatedAt: '' });

describe('brandForCarousel', () => {
  const brands = [kit('primeira'), kit('da-conta'), kit('propria')];
  const accounts = [{ id: 'conta', brandKitId: 'da-conta' }];

  it('uses the brand the carousel was made with', () => {
    expect(brandForCarousel({ brandKitId: 'propria', source: { accountId: 'conta' } }, brands, accounts)?.id).toBe('propria');
  });

  it('falls back to the account brand, then to the first brand, so a deleted brand never drops a carousel', () => {
    expect(brandForCarousel({ brandKitId: 'apagada', source: { accountId: 'conta' } }, brands, accounts)?.id).toBe('da-conta');
    expect(brandForCarousel({ brandKitId: 'apagada', source: { accountId: null } }, brands, accounts)?.id).toBe('primeira');
    expect(brandForCarousel({ brandKitId: 'apagada', source: {} }, [], accounts)).toBeNull();
  });
});
