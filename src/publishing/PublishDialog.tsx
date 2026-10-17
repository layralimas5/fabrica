import clsx from 'clsx';
import { CheckCircle2, ClipboardCopy, Download, ExternalLink, Send, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublishingService } from '../application/ports';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { activeJobFor, canAutoPublish, DRAFT_LEAD_MINUTES, jobStatusInfo, publishProblems, saoPauloDate, sendsToDrafts, sendTimeFor, type PublishingJob } from '../domain/publishing/job';
import { todayIso } from '../domain/schedule';
import type { SocialConnection } from '../domain/social/connection';
import { SOCIAL_PLATFORM_LABELS } from '../domain/social/publication';
import { copyText } from '../tracking/useTracking';
import { Alert, Badge, Button, Dialog, Field, Input, Select } from '../ui/primitives';

interface Props {
  carousel: Carousel;
  context: RenderContext;
  connections: SocialConnection[];
  jobs: PublishingJob[];
  publishing: PublishingService;
  onJob: (job: PublishingJob) => void;
  onMarkPosted: () => void;
  onClose: () => void;
}

const NETWORK_UPLOAD: Record<'tiktok' | 'instagram' | 'facebook', string> = {
  tiktok: 'https://www.tiktok.com/upload',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
};

/**
 * Two explicit steps for automatic publishing: schedule (waits for approval), then approve (renders the slides and
 * hands them to the queue). TikTok gets the carousel in the drafts; assisted publishing stays for anything else.
 */
export function PublishDialog({ carousel, context, connections, jobs, publishing, onJob, onMarkPosted, onClose }: Props) {
  const capable = useMemo(() => connections.filter(canAutoPublish), [connections]);
  const active = activeJobFor(jobs, carousel.id);
  const [mode, setMode] = useState<'auto' | 'assisted'>(capable.length && publishing.available ? 'auto' : 'assisted');
  const [connectionId, setConnectionId] = useState(active?.connectionId ?? capable[0]?.id ?? '');
  const [day, setDay] = useState(carousel.scheduledFor && carousel.scheduledFor >= todayIso() ? carousel.scheduledFor : todayIso());
  const [time, setTime] = useState(carousel.source.scheduledTime ?? '19:00');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const connection = capable.find((item) => item.id === connectionId) ?? null;
  const when = saoPauloDate(day, time || '00:00');
  const problems = connection ? publishProblems(carousel, connection, when, new Date()) : ['Escolhe a conta que vai publicar.'];
  const jobConnection = active ? connections.find((item) => item.id === active.connectionId) : undefined;
  const activeStatus = active ? jobStatusInfo(active.status, jobConnection?.platform) : null;
  const toDrafts = sendsToDrafts(active ? jobConnection?.platform : connection?.platform);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const schedule = () =>
    run('schedule', async () => {
      if (!connection) return;
      onJob(await publishing.createJob({ connectionId: connection.id, carouselId: carousel.id, scheduledAt: sendTimeFor(connection.platform, when).toISOString(), postAt: when.toISOString(), caption: carousel.caption, title: carousel.title }));
    });

  const approve = (job: PublishingJob) =>
    run('approve', async () => {
      // The carousel may have changed since it was scheduled: check it again as it is now (the time was checked then).
      const target = connections.find((item) => item.id === job.connectionId);
      const stillValid = target ? publishProblems(carousel, target, new Date(Date.now() + 86_400_000), new Date()) : ['A conta desse agendamento não está mais conectada.'];
      if (stillValid.length) throw new Error(stillValid.join(' '));
      const { carouselFiles } = await import('../app/exportCarousel');
      setProgress('Gerando as imagens…');
      const files = await carouselFiles(context, carousel, 'jpg', (done) => setProgress(`Gerando as imagens (${done}/${carousel.slides.length})…`));
      setProgress('Enviando para a fila…');
      onJob(await publishing.approve({ ...job, caption: carousel.caption, title: carousel.title }, files.filter((file) => file.name.endsWith('.jpg')).map((file) => file.blob)));
    });

  const download = () =>
    run('download', async () => {
      const { exportZip } = await import('../app/exportCarousel');
      await exportZip(context, carousel, 'jpg', (done) => setProgress(`Gerando ${done}/${carousel.slides.length}…`));
    });

  return (
    <Dialog open size="lg" title={`Publicar “${carousel.title}”`} onClose={onClose}>
      <div role="tablist" aria-label="Como publicar" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
        {(['auto', 'assisted'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={clsx('rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', mode === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
          >
            {value === 'auto' ? 'Publicação automática' : 'Publicação assistida'}
          </button>
        ))}
      </div>

      {mode === 'auto' ? (
        <div className="flex flex-col gap-4">
          {!publishing.available && <Alert tone="info">Publicação automática precisa do modo com login (Supabase), da função publish-worker e de uma conta conectada.</Alert>}
          {publishing.available && capable.length === 0 && (
            <Alert tone="info">Nenhuma conta conectada com permissão de publicar. Conecte em Contas conectadas.</Alert>
          )}

          {active ? (
            <section className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                {activeStatus && <Badge tone={activeStatus.tone}>{activeStatus.label}</Badge>}
                <span className="text-sm text-ink">
                  {jobConnection ? `@${jobConnection.username} · ${SOCIAL_PLATFORM_LABELS[jobConnection.platform]}` : 'Conta removida'} · postar {new Date(active.postAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {toDrafts && active.postAt !== active.scheduledAt && ` · chega aos rascunhos ${new Date(active.scheduledAt).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}`}
                </span>
              </div>
              {active.lastError && <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{active.lastError}</p>}
              {active.status === 'published' && active.permalink && (
                <a href={active.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  Ver o post <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
              {active.status === 'awaiting_approval' && (
                <p className="mt-3 text-sm text-muted">
                  {toDrafts
                    ? `Ao aprovar, a Fábrica gera as ${carousel.slides.length} imagens como estão agora e envia o carrossel com a legenda para os rascunhos do TikTok ${DRAFT_LEAD_MINUTES} minutos antes do horário de postar. Você recebe o aviso no app e, na hora, escolhe a música e publica. Dá pra cancelar até lá.`
                    : `Ao aprovar, a Fábrica gera as ${carousel.slides.length} imagens como estão agora e publica sozinha no horário marcado, com a legenda atual. Dá pra cancelar até a hora.`}
                </p>
              )}
              {active.status === 'published' && toDrafts && (
                <p className="mt-3 text-sm text-muted">Está nos rascunhos do TikTok. Abra o app, escolha a música e toque em Publicar. Depois de publicado, a sincronização traz os números.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {active.status === 'awaiting_approval' && (
                  <Button variant="primary" loading={busy === 'approve'} onClick={() => void approve(active)}>
                    <CheckCircle2 className="size-4" aria-hidden /> Aprovar e agendar
                  </Button>
                )}
                {active.status === 'failed' && (
                  <Button variant="primary" loading={busy === 'retry'} onClick={() => void run('retry', async () => onJob(await publishing.retry(active.id)))}>
                    Tentar de novo (pede nova aprovação)
                  </Button>
                )}
                {(active.status === 'awaiting_approval' || active.status === 'scheduled' || active.status === 'failed') && (
                  <Button variant="secondary" loading={busy === 'cancel'} onClick={() => void run('cancel', async () => onJob(await publishing.cancel(active.id)))}>
                    <XCircle className="size-4" aria-hidden /> Cancelar
                  </Button>
                )}
              </div>
            </section>
          ) : (
            capable.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Conta" htmlFor="publish-connection" className="sm:col-span-3">
                    <Select id="publish-connection" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                      {capable.map((item) => (
                        <option key={item.id} value={item.id}>
                          @{item.username || item.displayName} · {SOCIAL_PLATFORM_LABELS[item.platform]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Dia" htmlFor="publish-day">
                    <Input id="publish-day" type="date" value={day} min={todayIso()} onChange={(e) => e.target.value && setDay(e.target.value)} />
                  </Field>
                  <Field label="Horário de postar (Brasília)" htmlFor="publish-time">
                    <Input id="publish-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                </div>
                {problems.length > 0 && (
                  <ul className="flex flex-col gap-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    {problems.map((problem) => (
                      <li key={problem}>• {problem}</li>
                    ))}
                  </ul>
                )}
                <div>
                  <Button variant="primary" disabled={problems.length > 0} loading={busy === 'schedule'} onClick={() => void schedule()}>
                    <Send className="size-4" aria-hidden /> Agendar (fica aguardando sua aprovação)
                  </Button>
                  {toDrafts && <p className="mt-2 text-xs text-muted">No TikTok, o carrossel chega aos rascunhos da conta {DRAFT_LEAD_MINUTES} minutos antes desse horário. Na hora, a música e o toque em Publicar ficam com você no app.</p>}
                </div>
              </>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-muted">
            Você publica pelo app da rede. A Fábrica prepara tudo: as imagens em JPG, a legenda e o atalho.
          </p>
          <ol className="flex list-decimal flex-col gap-3 pl-5 marker:text-faint">
            <li>
              <Button variant="secondary" size="sm" loading={busy === 'download'} onClick={() => void download()}>
                <Download className="size-3.5" aria-hidden /> Baixar as imagens (ZIP com a legenda)
              </Button>
            </li>
            <li>
              <Button
                variant="secondary"
                size="sm"
                disabled={!carousel.caption.trim()}
                onClick={() =>
                  void copyText(carousel.caption).then((ok) => {
                    setCopied(ok);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                <ClipboardCopy className="size-3.5" aria-hidden /> {copied ? 'Legenda copiada' : 'Copiar a legenda'}
              </Button>
            </li>
            <li className="flex flex-wrap gap-2">
              {(['tiktok', 'instagram', 'facebook'] as const).map((network) => (
                <a
                  key={network}
                  href={NETWORK_UPLOAD[network]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Abrir {SOCIAL_PLATFORM_LABELS[network]} <ExternalLink className="size-3" aria-hidden />
                </a>
              ))}
            </li>
            <li>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onMarkPosted();
                  onClose();
                }}
              >
                <CheckCircle2 className="size-3.5" aria-hidden /> Já postei: marcar como publicado
              </Button>
            </li>
          </ol>
        </div>
      )}

      {progress && <p className="mt-4 text-xs text-muted" role="status">{progress}</p>}
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Dialog>
  );
}
