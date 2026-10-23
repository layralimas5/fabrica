import { Clapperboard, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { channelById, formatDuration, VIDEO_FORMAT_LABELS, VIDEO_STATUS_INFO, type VideoJob } from '../domain/studio/videoJob';
import { timeAgo } from '../domain/social/connection';
import { Badge, Button } from '../ui/primitives';

interface Props {
  job: VideoJob;
  scheduled: number;
  busy: boolean;
  onReview: () => void;
  onCancel: () => void;
  onRequeue: () => void;
  onRemove: () => void;
}

/** One request: where it is in the studio, and the actions that make sense in that state. */
export function VideoJobCard({ job, scheduled, busy, onReview, onCancel, onRequeue, onRemove }: Props) {
  const status = VIDEO_STATUS_INFO[job.status];
  const channel = channelById(job.channel);
  const durations = [job.outputs.long, job.outputs.vertical].filter((file) => file && file.durationSec > 0).map((file) => formatDuration(file!.durationSec));

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink" title={job.title}>
            {job.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {channel?.label ?? job.channel} · {job.mode === 'create' ? 'criar do zero' : 'renderizar'} · {job.formats.map((format) => VIDEO_FORMAT_LABELS[format].split(' (')[0]).join(' + ')}
            {durations.length > 0 && ` · ${durations.join(' / ')}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {scheduled > 0 && <Badge tone="accent">{scheduled === 1 ? '1 agendamento' : `${scheduled} agendamentos`}</Badge>}
        </div>
      </div>

      {job.status === 'working' && (
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>{job.step ?? 'Trabalhando'}</span>
            <span>{job.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${job.title}`}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${job.progress}%` }} />
          </div>
        </div>
      )}
      {job.status === 'queued' && job.step && <p className="text-xs text-muted">{job.step}</p>}
      {job.status === 'failed' && job.lastError && <p className="text-xs text-red-700 dark:text-red-300">{job.lastError}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-faint">Atualizado {timeAgo(job.updatedAt, new Date())}</span>
        <div className="flex flex-wrap gap-1.5">
          {(job.status === 'ready' || job.status === 'failed') && (
            <Button size="sm" variant={job.status === 'ready' ? 'primary' : 'secondary'} onClick={onReview}>
              <Clapperboard className="size-3.5" aria-hidden /> {job.status === 'ready' ? 'Revisar e publicar' : 'Ver log'}
            </Button>
          )}
          {(job.status === 'ready' || job.status === 'failed' || job.status === 'cancelled') && (
            <Button size="sm" onClick={onRequeue} disabled={busy}>
              <RotateCcw className="size-3.5" aria-hidden /> Refazer
            </Button>
          )}
          {(job.status === 'queued' || job.status === 'working') && (
            <Button size="sm" onClick={onCancel} disabled={busy}>
              <XCircle className="size-3.5" aria-hidden /> Cancelar
            </Button>
          )}
          {job.status !== 'working' && (
            <Button size="sm" variant="danger" onClick={onRemove} disabled={busy} aria-label={`Apagar ${job.title}`}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
