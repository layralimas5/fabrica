import { AlertTriangle, Play } from 'lucide-react';
import { useState } from 'react';
import type { PublishingService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { jobStatusInfo, type PublishingJob } from '../domain/publishing/job';
import type { SocialConnection } from '../domain/social/connection';
import { SOCIAL_PLATFORM_LABELS } from '../domain/social/publication';
import { Badge, Button } from '../ui/primitives';

interface Props {
  jobs: PublishingJob[];
  connections: SocialConnection[];
  carousels: Carousel[];
  publishing: PublishingService;
  onOpen: (carousel: Carousel) => void;
  onReload: () => Promise<void>;
}

const VISIBLE: PublishingJob['status'][] = ['awaiting_approval', 'scheduled', 'publishing', 'failed'];

/** What is waiting for approval, what will go out and what failed: the queue at a glance, next to the calendar. */
export function QueuePanel({ jobs, connections, carousels, publishing, onOpen, onReload }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const open = jobs.filter((job) => VISIBLE.includes(job.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const failed = open.filter((job) => job.status === 'failed').length;
  if (!publishing.available) return null;

  const processNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { processed } = await publishing.processNow();
      setMessage(processed ? `${processed} publicação(ões) processada(s).` : 'Nada vencido na fila agora.');
      await onReload();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Fila de publicação" className="rounded-2xl border border-line bg-surface p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Fila de publicação</h2>
        {failed > 0 && (
          <Badge tone="warning">
            <AlertTriangle className="mr-1 size-3" aria-hidden />
            {failed} com falha
          </Badge>
        )}
      </header>
      {open.length === 0 ? (
        <p className="text-xs text-muted">Nada na fila. Abra um carrossel no calendário e use "Publicar".</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((job) => {
            const carousel = carousels.find((item) => item.id === job.carouselId);
            const connection = connections.find((item) => item.id === job.connectionId);
            const status = jobStatusInfo(job.status, connection?.platform);
            return (
              <li key={job.id}>
                <button
                  type="button"
                  disabled={!carousel}
                  onClick={() => carousel && onOpen(carousel)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-line px-3 py-2 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-ink">{carousel?.title ?? job.title ?? 'Carrossel removido'}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </span>
                  <span className="text-[11px] text-faint">
                    {new Date(job.postAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {connection ? `@${connection.username} · ${SOCIAL_PLATFORM_LABELS[connection.platform]}` : 'conta removida'}
                  </span>
                  {job.lastError && <span className="text-[11px] text-amber-800 dark:text-amber-200">{job.lastError}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" loading={busy} onClick={() => void processNow()}>
          <Play className="size-3.5" aria-hidden /> Processar vencidos agora
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-xs text-muted">
          {message}
        </p>
      )}
    </section>
  );
}
