import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAccountScope } from '../app/accountScope';
import { errorMessage } from '../app/useResource';
import type { VideoJob } from '../domain/studio/videoJob';
import { NewVideoDialog } from '../studio/NewVideoDialog';
import { OfficeProposalsCard } from '../studio/OfficeProposalsCard';
import { ReviewDrawer } from '../studio/ReviewDrawer';
import { StudioLinkCard } from '../studio/StudioLinkCard';
import { useStudio } from '../studio/useStudio';
import { VideoJobCard } from '../studio/VideoJobCard';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';

/** Order on the screen: what needs her first (ready, failed), then what the studio is on, then the rest. */
const STATUS_ORDER: Record<VideoJob['status'], number> = { ready: 0, failed: 1, working: 2, queued: 3, cancelled: 4 };

export function StudioPage() {
  const scope = useAccountScope();
  const { studio, jobs, link, queue, connections, upsertJob, upsertQueued } = useStudio();
  const [creating, setCreating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstLoad = (jobs.loading && jobs.data.length === 0 && !jobs.error) || scope.loading;
  if (firstLoad) return <Spinner />;

  const project = scope.project;
  const visible = jobs.data
    .filter((job) => !project || job.projectId === project.id)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));
  const reviewing = jobs.data.find((job) => job.id === reviewingId) ?? null;

  const act = async (job: VideoJob, action: () => Promise<void>) => {
    setBusyId(job.id);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (job: VideoJob) =>
    act(job, async () => {
      if (!window.confirm(`Apagar “${job.title}” e os arquivos dele no Storage? O vídeo longo no PC continua lá.`)) return;
      await studio.remove(job);
      jobs.setData((current) => current.filter((item) => item.id !== job.id));
    });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Estúdio"
        description={`Pedidos de vídeo${project ? ` de ${project.name}` : ''} para o estúdio no PC: ele escreve, narra, monta no Remotion e devolve o longo e o vertical. Você revisa, aprova e a fila publica.`}
        action={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!studio.available}>
            <Plus className="size-4" aria-hidden /> Novo vídeo
          </Button>
        }
      />

      {!studio.available && (
        <div className="mb-6">
          <Alert tone="info">Você está no modo local. O estúdio precisa do modo com login: é pelo Supabase que o PC pega os pedidos e devolve os vídeos.</Alert>
        </div>
      )}
      {(error ?? jobs.error ?? link.error) && (
        <div className="mb-4">
          <Alert>{error ?? jobs.error ?? link.error}</Alert>
        </div>
      )}

      <OfficeProposalsCard studio={studio} queue={queue.data} jobs={jobs.data} connections={connections.data} onDecided={upsertQueued} />

      <div className="mb-8">
        <StudioLinkCard studio={studio} link={link.data} onChanged={() => void link.reload()} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Nenhum vídeo ainda"
          description="Mande um tema e o estúdio monta o vídeo no formato do canal. Também dá pra pedir só o render de uma composição que já existe."
          action={
            studio.available && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> Novo vídeo
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((job) => (
            <VideoJobCard
              key={job.id}
              job={job}
              scheduled={queue.data.filter((item) => item.videoJobId === job.id && item.status !== 'cancelled').length}
              busy={busyId === job.id}
              onReview={() => setReviewingId(job.id)}
              onCancel={() => void act(job, async () => upsertJob(await studio.cancel(job.id)))}
              onRequeue={() => void act(job, async () => upsertJob(await studio.requeue(job.id)))}
              onRemove={() => void remove(job)}
            />
          ))}
        </div>
      )}

      {creating && (
        <NewVideoDialog
          studio={studio}
          projects={scope.projects}
          defaultProjectId={project?.id ?? null}
          onClose={() => setCreating(false)}
          onCreated={(job) => {
            upsertJob(job);
            setCreating(false);
          }}
        />
      )}
      {reviewing && <ReviewDrawer studio={studio} job={reviewing} connections={connections.data} queue={queue.data} onClose={() => setReviewingId(null)} onJob={upsertJob} onQueued={upsertQueued} />}
    </div>
  );
}
