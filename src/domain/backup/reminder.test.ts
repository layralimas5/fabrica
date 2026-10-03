import { describe, expect, it } from 'vitest';
import { backupReminder } from './reminder';

const now = new Date('2026-10-03T12:00:00.000Z');

describe('backup reminder', () => {
  it('asks for a first backup', () => {
    expect(backupReminder(null, now)).toEqual({ due: true, daysSince: null });
    expect(backupReminder('not a date', now)).toEqual({ due: true, daysSince: null });
  });

  it('stays quiet for a month after a backup', () => {
    expect(backupReminder('2026-09-10T12:00:00.000Z', now)).toEqual({ due: false, daysSince: 23 });
    expect(backupReminder('2026-09-03T12:00:00.000Z', now)).toEqual({ due: true, daysSince: 30 });
  });
});
