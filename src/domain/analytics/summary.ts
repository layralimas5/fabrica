import { isPosted } from '../carousel';
import type { PerformanceKey } from '../winners/record';
import { isMeasured, type AnalyticsItem } from './items';

/** Posted carousels and contents registered from outside: what the numbers are about. */
export function isPublished(item: AnalyticsItem): boolean {
  return item.carousel ? isPosted(item.carousel) || isMeasured(item) : true;
}

/** Pooled rate of a group (sum over sum), steadier than averaging each content's rate. */
export function pooledRate(items: AnalyticsItem[], part: PerformanceKey): number | null {
  const measured = items.filter((item) => item.record.metrics[part] !== null && item.record.metrics.views);
  if (measured.length === 0) return null;
  const views = measured.reduce((sum, item) => sum + (item.record.metrics.views ?? 0), 0);
  return views ? measured.reduce((sum, item) => sum + (item.record.metrics[part] ?? 0), 0) / views : null;
}
