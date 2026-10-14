import { useCallback } from 'react';
import { useServices } from '../app/services';
import { useResource } from '../app/useResource';
import { addDays, todayIso } from '../domain/schedule';
import type { TrackingEvent, TrackingLink } from '../domain/tracking/tracking';

/** Events are read for the longest comparison the screens offer (90 days and the 90 before). */
export const EVENT_DAYS = 200;

export function useTracking() {
  const { tracking } = useServices();
  const since = addDays(todayIso(), -EVENT_DAYS);
  const links = useResource<TrackingLink[]>(useCallback(() => tracking.listLinks(), [tracking]), []);
  const events = useResource<TrackingEvent[]>(useCallback(() => tracking.listEvents(since), [tracking, since]), []);
  return { tracking, links, events };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
