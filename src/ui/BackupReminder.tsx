import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadBackup } from '../app/downloadBackup';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { backupReminder, type BackupReminder as Reminder } from '../domain/backup/reminder';
import { Alert, Button } from './primitives';

/** Monthly nudge to download a backup: the only copy of the data outside the app. Hidden until the next visit when dismissed. */
export function BackupReminder() {
  const { backup } = useServices();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backup) return;
    let active = true;
    backup
      .lastBackupAt()
      .then((last) => active && setReminder(backupReminder(last)))
      .catch((cause: unknown) => console.error('Não consegui ler a data do último backup', cause));
    return () => {
      active = false;
    };
  }, [backup]);

  if (!backup || !reminder?.due || dismissed) return null;

  const download = async () => {
    setPending(true);
    setError(null);
    try {
      await downloadBackup(backup);
      setReminder(backupReminder(new Date().toISOString()));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-label="Lembrete de backup" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">
          {reminder.daysSince === null ? 'Você ainda não baixou nenhum backup.' : `Seu último backup foi há ${reminder.daysSince} dias.`}{' '}
          <span className="text-muted">Baixe um e guarde no OneDrive: é a cópia dos seus carrosséis e métricas fora da Fábrica.</span>
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="primary" loading={pending} onClick={() => void download()}>
            {!pending && <Download className="size-3.5" aria-hidden />} Baixar backup agora
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} aria-label="Lembrar depois">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  );
}
