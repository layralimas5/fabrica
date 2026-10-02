import { useCallback, useState } from 'react';
import { DEFAULT_WEEKLY_GOAL } from '../domain/calendar/calendar';
import { DEFAULT_SIMILARITY_SETTINGS, sanitizeSimilaritySettings, type SimilaritySettings } from '../domain/similarity/similarity';

const SIMILARITY_KEY = 'fabrica:similarity-settings';
const WEEKLY_GOAL_KEY = 'fabrica:weekly-goal';
const DISMISSED_SIMILARITY_KEY = 'fabrica:similarity-dismissed';
/** Oldest dismissals are dropped past this, so the list never grows forever. */
const MAX_DISMISSED = 500;

function read<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Planning preferences live in this browser; the defaults work without storage.
  }
}

/** Detector windows and threshold, adjustable in Configurações. */
export function useSimilaritySettings() {
  const [settings, setState] = useState<SimilaritySettings>(() => read(SIMILARITY_KEY, (raw) => sanitizeSimilaritySettings(JSON.parse(raw) as Record<string, unknown>), DEFAULT_SIMILARITY_SETTINGS));
  const setSettings = useCallback((next: SimilaritySettings) => {
    const clean = sanitizeSimilaritySettings(next);
    setState(clean);
    write(SIMILARITY_KEY, JSON.stringify(clean));
  }, []);
  return { settings, setSettings };
}

/** Contents to publish per week across the filtered accounts. */
export function useWeeklyGoal() {
  const [goal, setState] = useState<number>(() => read(WEEKLY_GOAL_KEY, (raw) => Math.max(1, Math.min(500, Math.round(Number(raw)) || DEFAULT_WEEKLY_GOAL)), DEFAULT_WEEKLY_GOAL));
  const setGoal = useCallback((next: number) => {
    const clean = Math.max(1, Math.min(500, Math.round(next) || DEFAULT_WEEKLY_GOAL));
    setState(clean);
    write(WEEKLY_GOAL_KEY, String(clean));
  }, []);
  return { goal, setGoal };
}

/** Similarity warnings the user closed, one per pair of contents, remembered in this browser. */
export function useDismissedSimilarity() {
  const [dismissed, setDismissed] = useState<string[]>(() => read(DISMISSED_SIMILARITY_KEY, (raw) => (JSON.parse(raw) as unknown[]).filter((item): item is string => typeof item === 'string'), []));
  const isDismissed = useCallback((contentId: string, otherId: string) => dismissed.includes(pairKey(contentId, otherId)), [dismissed]);
  const dismiss = useCallback((contentId: string, otherId: string) => {
    setDismissed((current) => {
      const next = [...current.filter((key) => key !== pairKey(contentId, otherId)), pairKey(contentId, otherId)].slice(-MAX_DISMISSED);
      write(DISMISSED_SIMILARITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { isDismissed, dismiss };
}

const pairKey = (contentId: string, otherId: string) => `${contentId}:${otherId}`;
