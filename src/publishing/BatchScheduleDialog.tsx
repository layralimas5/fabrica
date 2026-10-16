import { CalendarClock, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublishingService } from '../application/ports';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { planBatch, validTimes, type BatchEntry } from '../domain/publishing/batch';
import { canAutoPublish, sendsToDrafts, type PublishingJob } from '../domain/publishing/job';
import { addDays, todayIso } from '../domain/schedule';
import type { SocialConnection } from '../domain/social/connection';
import { SOCIAL_PLATFORM_LABELS } from '../domain/social/publication';
import { Alert, Button, Dialog, Field, Input } from '../ui/primitives';

interface Props {
  carousels: Carousel[];
  contextOf: (carousel: Carousel) => RenderContext | null;
  connections: SocialConnection[];
  jobs: PublishingJob[];
  publishing: PublishingService;
  onJob: (job: PublishingJob) => void;
  onClose: () => void;
}

interface Outcome {
  done: number;
  failures: { title: string; reason: string }[];
}

const whenLabel = (date: Date | null) => (date ? date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/** Picks accounts and times once, shows where each carousel lands, then schedules and approves them all. */
export function BatchScheduleDialog({ carousels, contextOf, connections, jobs, publishing, onJob, onClose }: Props) {
  const capable = useMemo(() => connections.filter((connection) => canAutoPublish(connection) && connection.status === 'connected'), [connections]);
  const [connectionIds, setConnectionIds] = useState<string[]>(() => {
    const own = capable.filter((connection) => carousels.some((carousel) => connection.accountId !== null && connection.accountId === carousel.source.accountId));
    return (own.length ? own : capable).map((connection) => connection.id);
  });
  const [preferOwnAccount, setPreferOwnAccount] = useState(true);
  const [startDay, setStartDay] = useState(addDays(todayIso(), 1));
  const [times, setTimes] = useState<string[]>(['19:00']);
  const [newTime, setNewTime] = useState('12:00');
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const plan = useMemo(() => planBatch(carousels, connections, jobs, { connectionIds, preferOwnAccount, startDay, times }, new Date()), [carousels, connections, jobs, connectionIds, preferOwnAccount, startDay, times]);
  const ready = plan.filter((entry) => entry.problems.length === 0);
  const toDrafts = ready.some((entry) => sendsToDrafts(entry.connection?.platform));
  const running = progress !== null;

  const toggleConnection = (id: string) => setConnectionIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const addTime = () => setTimes((current) => validTimes([...current, newTime]));

  const scheduleOne = async (entry: BatchEntry, position: number) => {
    const { carousel, connection, when } = entry;
    const context = contextOf(carousel);
    if (!connection || !when) throw new Error('Sem conta ou horário.');
    if (!context) throw new Error('O carrossel não tem marca pra gerar as imagens.');
    const job = await publishing.createJob({ connectionId: connection.id, carouselId: carousel.id, scheduledAt: when.toISOString(), caption: carousel.caption, title: carousel.title });
    onJob(job);
    const { carouselFiles } = await import('../app/exportCarousel');
    const files = await carouselFiles(context, carousel, 'jpg', (done) => setProgress(`Carrossel ${position} de ${ready.length}: imagem ${done}/${carousel.slides.length}`));
    onJob(await publishing.approve({ ...job, caption: carousel.caption, title: carousel.title }, files.filter((file) => file.name.endsWith('.jpg')).map((file) => file.blob)));
  };

  const run = async () => {
    const result: Outcome = { done: 0, failures: [] };
    for (const [index, entry] of ready.entries()) {
      setProgress(`Carrossel ${index + 1} de ${ready.length}…`);
      try {
        await scheduleOne(entry, index + 1);
        result.done += 1;
      } catch (cause) {
        // One carousel that fails does not stop the others; it is listed at the end.
        result.failures.push({ title: entry.carousel.title, reason: errorMessage(cause) });
      }
    }
    setProgress(null);
    setOutcome(result);
  };

  if (outcome) {
    return (
      <Dialog open size="lg" title="Agendamento em lote" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Fechar</Button>}>
        <div className="flex flex-col gap-3">
          <Alert tone={outcome.failures.length ? 'info' : 'success'}>
            {outcome.done} {outcome.done === 1 ? 'carrossel agendado e aprovado' : 'carrosséis agendados e aprovados'}. Eles aparecem na fila do Calendário.
            {toDrafts ? ' No TikTok, cada um chega aos rascunhos no horário marcado: aí é só escolher a música e publicar.' : ''}
          </Alert>
          {outcome.failures.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {outcome.failures.map((failure) => (
                <li key={failure.title}>
                  • <strong>{failure.title}</strong>: {failure.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      size="xl"
      title={`Agendar ${carousels.length} ${carousels.length === 1 ? 'carrossel' : 'carrosséis'}`}
      onClose={() => !running && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={running} disabled={ready.length === 0} onClick={() => void run()}>
            <CalendarClock className="size-4" aria-hidden /> Agendar e aprovar {ready.length}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {capable.length === 0 ? (
          <Alert tone="info">Nenhuma conta conectada com permissão de publicar. Conecte em Contas conectadas.</Alert>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Contas</legend>
            <div className="flex flex-wrap gap-2">
              {capable.map((connection) => (
                <label key={connection.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                  <input type="checkbox" checked={connectionIds.includes(connection.id)} disabled={running} onChange={() => toggleConnection(connection.id)} className="size-4 accent-[var(--accent)]" />
                  @{connection.username || connection.displayName} · {SOCIAL_PLATFORM_LABELS[connection.platform]}
                </label>
              ))}
            </div>
            <label className="mt-1 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={preferOwnAccount} disabled={running} onChange={(e) => setPreferOwnAccount(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Carrossel feito pra uma conta vai pra ela (quando estiver marcada). Os outros se revezam entre as contas marcadas.
            </label>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Começar em" htmlFor="batch-start">
            <Input id="batch-start" type="date" value={startDay} min={todayIso()} disabled={running} onChange={(e) => e.target.value && setStartDay(e.target.value)} />
          </Field>
          <Field label="Horários de cada dia (Brasília)" htmlFor="batch-time" hint="Cada conta usa um horário por post: preenche o dia e passa pro seguinte.">
            <div className="flex flex-wrap items-center gap-2">
              {times.map((time) => (
                <span key={time} className="inline-flex h-9 items-center gap-1 rounded-xl bg-subtle pl-3 pr-1 text-sm tabular-nums text-ink">
                  {time}
                  <button type="button" aria-label={`Tirar ${time}`} disabled={running} onClick={() => setTimes((current) => current.filter((item) => item !== time))} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              <Input id="batch-time" type="time" value={newTime} disabled={running} onChange={(e) => setNewTime(e.target.value)} className="!h-9 !w-auto" />
              <Button size="sm" variant="secondary" disabled={running} onClick={addTime}>
                <Plus className="size-3.5" aria-hidden /> Adicionar
              </Button>
            </div>
          </Field>
        </div>

        <section aria-labelledby="batch-plan">
          <h3 id="batch-plan" className="mb-2 text-sm font-medium text-ink">
            Onde cada um cai ({ready.length} de {plan.length} prontos)
          </h3>
          <ol className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {plan.map((entry) => (
              <li key={entry.carousel.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="min-w-0 flex-1 truncate text-ink">{entry.carousel.title}</span>
                <span className="text-xs text-muted">{entry.connection ? `@${entry.connection.username || entry.connection.displayName}` : '—'}</span>
                <span className="w-36 text-xs tabular-nums text-muted">{whenLabel(entry.when)}</span>
                {entry.problems.length > 0 && <span className="text-xs text-amber-800 sm:max-w-[40%] dark:text-amber-200">{entry.problems.join(' ')}</span>}
              </li>
            ))}
          </ol>
        </section>

        {toDrafts && <p className="text-xs text-muted">No TikTok, cada carrossel vai para os rascunhos da conta no horário marcado. A música e o toque em Publicar ficam com você no app.</p>}
        {progress && (
          <p role="status" className="text-xs text-muted">
            {progress}
          </p>
        )}
      </div>
    </Dialog>
  );
}
