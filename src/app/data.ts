import { useCallback } from 'react';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { Preset } from '../domain/preset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import type { ContentRecord } from '../domain/winners/record';
import type { Experiment } from '../domain/experiments/experiment';
import type { CalendarEntry } from '../domain/calendar/calendar';
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

export function usePresets() {
  const { presets } = useServices();
  return useResource<Preset[]>(useCallback(() => presets.list(), [presets]), []);
}

export function useContentRecords() {
  const { contentRecords } = useServices();
  return useResource<ContentRecord[]>(useCallback(() => contentRecords.list(), [contentRecords]), []);
}

export function useExperiments() {
  const { experiments } = useServices();
  return useResource<Experiment[]>(useCallback(() => experiments.list(), [experiments]), []);
}

export function useCalendarEntries() {
  const { calendarEntries } = useServices();
  return useResource<CalendarEntry[]>(useCallback(() => calendarEntries.list(), [calendarEntries]), []);
}
