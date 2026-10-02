import { useCallback, useMemo, useState } from 'react';
import { useAccounts, useAssets, useBrandKits, useCarousels, useContentRecords } from '../app/data';
import { accountLabel as labelOfAccount, type Account } from '../domain/account';
import { analyticsItems, isMeasured } from '../domain/analytics/items';
import { accountKey, type ContentRecord, type PerformanceMetrics } from '../domain/winners/record';
import { baselineFor, buildBaselines, performanceScore, sanitizeWeights, SCORE_PROFILES, weightsFor, type ContentScore, type ScoreProfile, type ScoreWeights } from '../domain/winners/score';

const PROFILE_KEY = 'fabrica:score-profile';
const WEIGHTS_KEY = 'fabrica:score-weights';

function readProfile(): ScoreProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return SCORE_PROFILES.find((profile) => profile === stored) ?? 'equilibrado';
  } catch {
    return 'equilibrado';
  }
}

function readWeights(): ScoreWeights | null {
  try {
    const stored = localStorage.getItem(WEIGHTS_KEY);
    return stored ? sanitizeWeights(JSON.parse(stored) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The score profile is a per-browser preference; the page works without storage.
  }
}

/** Score profile and custom weights, remembered in this browser. */
export function useScoreSettings() {
  const [profile, setProfileState] = useState<ScoreProfile>(readProfile);
  const [custom, setCustomState] = useState<ScoreWeights | null>(readWeights);

  const setProfile = useCallback((next: ScoreProfile) => {
    setProfileState(next);
    store(PROFILE_KEY, next);
  }, []);

  const setCustom = useCallback((next: ScoreWeights) => {
    setCustomState(next);
    setProfileState('personalizado');
    store(WEIGHTS_KEY, JSON.stringify(next));
    store(PROFILE_KEY, 'personalizado');
  }, []);

  return { profile, setProfile, custom, setCustom, weights: weightsFor(profile, custom) };
}

export function accountLabelOf(record: Pick<ContentRecord, 'accountId' | 'accountLabel'>, accounts: Account[]): string | null {
  const account = record.accountId ? accounts.find((item) => item.id === record.accountId) : undefined;
  if (account) return labelOfAccount(account);
  return record.accountLabel || null;
}

/** Everything the winners pages read, loaded once, plus the score of any set of numbers. */
export function useWinnerLibrary() {
  const records = useContentRecords();
  const carousels = useCarousels();
  const accounts = useAccounts();
  const brands = useBrandKits();
  const assets = useAssets();
  const score = useScoreSettings();

  /** Every carousel and every content made elsewhere, so the score of one is always read against the same base. */
  const items = useMemo(() => analyticsItems(carousels.data, records.data, accounts.data), [carousels.data, records.data, accounts.data]);
  const baselines = useMemo(() => buildBaselines(items.filter(isMeasured).map((item) => ({ account: accountKey(item.record), metrics: item.record.metrics }))), [items]);
  const scoreOf = useCallback(
    (metrics: PerformanceMetrics, account: string | null): ContentScore | null => performanceScore(metrics, baselineFor(baselines, account), score.weights),
    [baselines, score.weights],
  );
  const scoreValue = useCallback((metrics: PerformanceMetrics, account: string | null) => scoreOf(metrics, account)?.value ?? null, [scoreOf]);

  /** Label of a grouping key from accountKey(): registered accounts by name, typed ones as typed. */
  const accountLabel = useCallback(
    (key: string) => {
      const account = accounts.data.find((item) => `id:${item.id}` === key);
      if (account) return labelOfAccount(account);
      const record = records.data.find((item) => accountKey(item) === key);
      return (record && accountLabelOf(record, accounts.data)) ?? key.replace(/^(id|label):/, '');
    },
    [records.data, accounts.data],
  );

  const accountOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const account of accounts.data) options.set(`id:${account.id}`, labelOfAccount(account));
    for (const record of records.data) {
      const key = accountKey(record);
      if (key && !options.has(key)) options.set(key, accountLabelOf(record, accounts.data) ?? key);
    }
    return [...options.entries()].map(([key, label]) => ({ key, label }));
  }, [accounts.data, records.data]);

  const loading = records.loading || carousels.loading || accounts.loading || brands.loading || assets.loading;
  const error = records.error ?? carousels.error ?? accounts.error ?? brands.error ?? assets.error;

  return { records, carousels, accounts, brands, assets, items, score, scoreOf, scoreValue, accountLabel, accountOptions, loading, error };
}

export type WinnerLibrary = ReturnType<typeof useWinnerLibrary>;
