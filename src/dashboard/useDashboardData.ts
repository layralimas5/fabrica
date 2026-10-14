import { useCallback, useMemo } from 'react';
import { useAccounts, useAssets, useBrandKits, useCarousels, useContentRecords, usePublications } from '../app/data';
import { useServices } from '../app/services';
import { useResource } from '../app/useResource';
import { analyticsItems } from '../domain/analytics/items';
import { buildDashItems } from '../domain/dashboard/items';
import type { Project } from '../domain/project';
import { addDays, todayIso } from '../domain/schedule';
import type { SocialConnection } from '../domain/social/connection';
import type { AccountSnapshot, PostSnapshot } from '../domain/social/metrics';

/** Synced readings are loaded for the longest period the Painel compares (90 days + the 90 before). */
export const SNAPSHOT_DAYS = 200;

interface SocialData {
  connections: SocialConnection[];
  posts: PostSnapshot[];
  accounts: AccountSnapshot[];
}

/** Everything the Painel and the Inteligência read: contents, manual numbers, synced posts and readings. */
export function useDashboardData(projects: Project[]) {
  const { social } = useServices();
  const carousels = useCarousels();
  const records = useContentRecords();
  const accounts = useAccounts();
  const publications = usePublications();
  const brands = useBrandKits();
  const assets = useAssets();
  const since = addDays(todayIso(), -SNAPSHOT_DAYS);
  const socialData = useResource<SocialData>(
    useCallback(async () => {
      const [connections, posts, accountSnapshots] = await Promise.all([social.listConnections(), social.postSnapshots(since), social.accountSnapshots(since)]);
      return { connections, posts, accounts: accountSnapshots };
    }, [social, since]),
    { connections: [], posts: [], accounts: [] },
  );

  const items = useMemo(
    () =>
      buildDashItems({
        analyticsItems: analyticsItems(carousels.data, records.data, accounts.data),
        publications: publications.data,
        snapshots: socialData.data.posts,
        connections: socialData.data.connections,
        accounts: accounts.data,
        projects,
      }),
    [carousels.data, records.data, accounts.data, publications.data, socialData.data, projects],
  );

  const loading = carousels.loading || records.loading || accounts.loading || publications.loading || socialData.loading;
  const error = carousels.error ?? records.error ?? accounts.error ?? publications.error ?? socialData.error;
  const reload = useCallback(async () => {
    await Promise.all([carousels.reload(), records.reload(), publications.reload(), socialData.reload()]);
  }, [carousels, records, publications, socialData]);

  return { items, loading, error, reload, social: socialData.data, carousels, records, accounts, publications, brands, assets, available: social.available };
}
