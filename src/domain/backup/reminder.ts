/** A backup a month keeps at most a month of results at risk. */
export const BACKUP_INTERVAL_DAYS = 30;

const DAY_MS = 86_400_000;

export interface BackupReminder {
  due: boolean;
  /** Whole days since the last backup; null when there was never one. */
  daysSince: number | null;
}

export function backupReminder(lastBackupAt: string | null, now: Date = new Date()): BackupReminder {
  const last = lastBackupAt ? Date.parse(lastBackupAt) : Number.NaN;
  if (Number.isNaN(last)) return { due: true, daysSince: null };
  const daysSince = Math.max(0, Math.floor((now.getTime() - last) / DAY_MS));
  return { due: daysSince >= BACKUP_INTERVAL_DAYS, daysSince };
}
