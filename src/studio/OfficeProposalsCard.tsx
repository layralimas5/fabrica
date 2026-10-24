import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { StudioService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import type { PublishingJob } from '../domain/publishing/job';
import type { SocialConnection } from '../domain/social/connection';
import type { VideoJob } from '../domain/studio/videoJob';
import { Alert, Badge, Button } from '../ui/primitives';

interface OfficeProposalsCardProps {
  studio: StudioService;
  queue: PublishingJob[];
  jobs: VideoJob[];
  connections: SocialConnection[];
  onDecided: (job: PublishingJob) => void;
}

const when = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Posts the office agent (Jason) put in the queue. Nothing goes out until she approves here. */
export function OfficeProposalsCard({ studio, queue, jobs, connections, onDecided }: OfficeProposalsCardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposals = queue.filter((job) => job.status === 'awaiting_approval' && job.videoJobId);
  if (proposals.length === 0) return null;

  const decide = async (job: PublishingJob, approve: boolean) => {
    setBusyId(job.id);
    setError(null);
    try {
      onDecided(await studio.decideProposal(job.id, approve));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="propostas-escritorio" className="mb-6 rounded-2xl border border-amber-300/40 bg-amber-300/5 p-4">
      <h2 id="propostas-escritorio" className="text-sm font-semibold">Postagens propostas pelo escritório ({proposals.length})</h2>
      <p className="mb-3 text-xs text-muted">O Jason preparou e agendou estas postagens. Só saem se você aprovar.</p>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <ul className="space-y-2">
        {proposals.map((job) => {
          const video = jobs.find((item) => item.id === job.videoJobId);
          const account = connections.find((item) => item.id === job.connectionId);
          const late = new Date(job.scheduledAt).getTime() < Date.now();
          return (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{job.title || video?.title || 'Vídeo do estúdio'}</p>
                <p className="text-xs text-muted">
                  {account ? `${account.platform} · @${account.username}` : 'conta removida'} · postar {when.format(new Date(job.postAt))}
                </p>
                {job.caption && <p className="mt-1 line-clamp-2 text-xs text-muted">{job.caption}</p>}
              </div>
              <div className="flex items-center gap-2">
                {late && <Badge tone="warning">Horário passou</Badge>}
                <Button size="sm" variant="primary" loading={busyId === job.id} disabled={late || busyId !== null} onClick={() => void decide(job, true)}>
                  <Check className="size-4" aria-hidden /> Aprovar
                </Button>
                <Button size="sm" disabled={busyId !== null} onClick={() => void decide(job, false)}>
                  <X className="size-4" aria-hidden /> Recusar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
