import type { BackupService } from '../application/ports';

/** Builds the backup and hands it to the browser as fabrica-backup-YYYY-MM-DD.json. */
export async function downloadBackup(backup: BackupService): Promise<void> {
  const blob = await backup.exportAll();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fabrica-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
