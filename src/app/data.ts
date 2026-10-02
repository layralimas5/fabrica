import { useCallback } from 'react';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { useServices } from './services';
import { useResource } from './useResource';

export function useBrandKits() {
  const { brandKits } = useServices();
  return useResource<BrandKit[]>(useCallback(() => brandKits.list(), [brandKits]), []);
}

export function useAssets() {
  const { assets } = useServices();
  return useResource<Asset[]>(useCallback(() => assets.list(), [assets]), []);
}

export function useCarousels() {
  const { carousels } = useServices();
  return useResource<Carousel[]>(useCallback(() => carousels.list(), [carousels]), []);
}

export function useAccounts() {
  const { accounts } = useServices();
  return useResource<Account[]>(useCallback(() => accounts.list(), [accounts]), []);
}
