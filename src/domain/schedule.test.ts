import { describe, expect, it } from 'vitest';
import { addDays, countByDay, distributeDates, isIsoDate } from './schedule';

describe('schedule', () => {
  it('spreads posts per day from the start date', () => {
    expect(distributeDates(5, { startDate: '2026-10-30', perDay: 2 })).toEqual(['2026-10-30', '2026-10-30', '2026-10-31', '2026-10-31', '2026-11-01']);
  });

  it('treats zero or negative per-day as one post a day', () => {
    expect(distributeDates(2, { startDate: '2026-10-02', perDay: 0 })).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts posts per day in order', () => {
    expect(countByDay(['2026-10-02', '2026-10-02', '2026-10-03'])).toEqual([
      { date: '2026-10-02', count: 2 },
      { date: '2026-10-03', count: 1 },
    ]);
  });

  it('validates dates', () => {
    expect(isIsoDate('2026-10-02')).toBe(true);
    expect(isIsoDate('02/10/2026')).toBe(false);
  });
});
