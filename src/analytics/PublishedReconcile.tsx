import { CalendarCheck, History } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/primitives';

interface PublishedReconcileProps {
  /** Carousels whose day passed but are still Agendado or Pronto. */
  overdue: number;
  /** Posted contents the current period leaves out. */
  outsidePeriod: number;
  onMarkPosted: () => Promise<void>;
  onShowAll: () => void;
}

/** Explains a "Conteúdos publicados" lower than what was really posted, and fixes it in one click. */
export function PublishedReconcile({ overdue, outsidePeriod, onMarkPosted, onShowAll }: PublishedReconcileProps) {
  const [pending, setPending] = useState(false);
  if (overdue === 0 && outsidePeriod === 0) return null;

  const markAll = async () => {
    setPending(true);
    try {
      await onMarkPosted();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3">
      {overdue > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          <CalendarCheck className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {overdue === 1 ? '1 carrossel já passou do dia de postar' : `${overdue} carrosséis já passaram do dia de postar`} e ainda {overdue === 1 ? 'está' : 'estão'} como Agendado ou Pronto, então não {overdue === 1 ? 'entra' : 'entram'} na conta de publicados.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={pending} onClick={() => void markAll()}>
              Marcar como postados
            </Button>
            <Link to="/calendario" className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium underline underline-offset-2">
              Revisar no Calendário
            </Link>
          </div>
        </div>
      )}
      {outsidePeriod > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <History className="size-3.5" aria-hidden />
          {outsidePeriod} {outsidePeriod === 1 ? 'conteúdo postado fica' : 'conteúdos postados ficam'} fora do período escolhido.
          <button type="button" onClick={onShowAll} className="font-medium text-ink underline underline-offset-2">
            Ver tudo
          </button>
        </p>
      )}
    </div>
  );
}
