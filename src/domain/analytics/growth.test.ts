import { describe, expect, it } from 'vitest';
import { emptyPerformance, emptyRecordInput, sanitizeRecordInput, withMeasurement, withoutMeasurement, type ContentRecord, type PerformanceMetrics } from '../winners/record';
import { measurementSteps, momentumOf } from './growth';

const numbers = (values: Partial<PerformanceMetrics>): PerformanceMetrics => ({ ...emptyPerformance(), ...values });

let sequence = 0;
function record(publishedAt: string | null, history: [string, Partial<PerformanceMetrics>][]): ContentRecord {
  sequence += 1;
  let input = { ...emptyRecordInput(), publishedAt };
  for (const [day, values] of history) input = withMeasurement(input, day, numbers(values));
  return { ...input, id: `r${sequence}`, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' };
}

describe('metrics history', () => {
  it('keeps one measurement per day and the latest day as the current numbers', () => {
    let input = emptyRecordInput();
    input = withMeasurement(input, '2026-10-03', numbers({ views: 900 }));
    input = withMeasurement(input, '2026-09-28', numbers({ views: 300 }));
    input = withMeasurement(input, '2026-10-03', numbers({ views: 1000 }));
    expect(input.metricsHistory.map((snapshot) => [snapshot.day, snapshot.metrics.views])).toEqual([
      ['2026-09-28', 300],
      ['2026-10-03', 1000],
    ]);
    expect(input.metrics.views).toBe(1000);
    expect(withoutMeasurement(input, '2026-10-03').metrics.views).toBe(300);
  });

  it('starts the history from the numbers saved before it existed', () => {
    const input = sanitizeRecordInput({ metrics: numbers({ views: 500 }), metricsUpdatedAt: '2026-09-20T12:00:00.000Z' });
    expect(input.metricsHistory).toEqual([{ day: '2026-09-20', metrics: numbers({ views: 500 }) }]);
  });
});

describe('growth', () => {
  it('measures each step against the one before, counting the posting day as zero', () => {
    const steps = measurementSteps(record('2026-09-01', [['2026-09-03', { views: 400 }], ['2026-09-08', { views: 900 }]]));
    expect(steps.map((step) => [step.ageDays, step.delta.views, step.viewsPerDay])).toEqual([
      [2, 400, 200],
      [7, 500, 100],
    ]);
  });

  it('tells a post still growing from one that stopped', () => {
    expect(momentumOf(record('2026-09-01', [['2026-09-02', { views: 100 }], ['2026-09-04', { views: 400 }]]))).toBe('growing');
    expect(momentumOf(record('2026-09-01', [['2026-09-02', { views: 1000 }], ['2026-09-12', { views: 1100 }]]))).toBe('slowing');
    expect(momentumOf(record('2026-09-01', [['2026-09-02', { views: 1000 }], ['2026-09-09', { views: 1010 }]]))).toBe('stable');
    expect(momentumOf(record('2026-09-01', [['2026-09-02', { views: 1000 }]]))).toBe('early');
  });
});
