import { ExternalLink, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StudioService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import { jobStatusInfo, saoPauloDate, sendsToDrafts, sendTimeFor, type PublishingJob } from '../domain/publishing/job';
import { todayIso } from '../domain/schedule';
import type { SocialConnection } from '../domain/social/connection';
import { SOCIAL_PLATFORM_LABELS } from '../domain/social/publication';
import {
  formatDuration,
  formatsFor,
  VIDEO_FORMAT_LABELS,
  VIDEO_PRIVACY_LABELS,
  videoPublishProblems,
  type VideoFormat,
  type VideoJob,
  type VideoPrivacy,
} from '../domain/studio/videoJob';
import { Drawer } from '../ui/Drawer';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '../ui/primitives';

interface Props {
  studio: StudioService;
  job: VideoJob;
  connections: SocialConnection[];
  queue: PublishingJob[];
  onClose: () => void;
  onJob: (job: VideoJob) => void;
  onQueued: (job: PublishingJob) => void;
}

/** Signed links of the files to watch, opened when the panel opens (they last one hour). */
function usePreviewUrls(studio: StudioService, job: VideoJob) {
  const [urls, setUrls] = useState<Partial<Record<'long' | 'vertical' | 'thumbnail', string>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const wanted = { long: job.outputs.long?.previewPath ?? job.outputs.long?.path, vertical: job.outputs.vertical?.path, thumbnail: job.outputs.thumbnail };
    void (async () => {
      try {
        const entries = await Promise.all(Object.entries(wanted).map(async ([key, path]) => [key, path ? await studio.fileUrl(path) : undefined] as const));
        if (alive) setUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      } catch (cause) {
        if (alive) setError(errorMessage(cause));
      }
    })();
    return () => {
      alive = false;
    };
  }, [studio, job.outputs]);
  return { urls, error };
}

export function ReviewDrawer({ studio, job, connections, queue, onClose, onJob, onQueued }: Props) {
  const { urls, error: previewError } = usePreviewUrls(studio, job);
  const [title, setTitle] = useState(job.title);
  const [caption, setCaption] = useState(job.caption);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capable = useMemo(() => connections.filter((connection) => connection.status === 'connected'), [connections]);
  const scheduled = queue.filter((item) => item.videoJobId === job.id && item.status !== 'cancelled');
  const dirty = title !== job.title || caption !== job.caption;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onJob(await studio.updateJob(job.id, { title: title.trim() || job.title, caption }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={`Revisar “${job.title}”`} open onClose={onClose}>
      <div className="flex flex-col gap-6">
        {job.status === 'failed' && <Alert>{job.lastError ?? 'O estúdio não conseguiu terminar.'}</Alert>}
        {previewError && <Alert>{previewError}</Alert>}

        {job.status === 'ready' && (
          <section aria-label="Prévia" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)]">
            {job.outputs.long && (
              <figure className="flex flex-col gap-1.5">
                {urls.long ? (
                  <video src={urls.long} controls preload="metadata" poster={urls.thumbnail} className="aspect-video w-full rounded-xl bg-black" />
                ) : (
                  <div className="grid aspect-video place-items-center rounded-xl bg-subtle px-4 text-center text-xs text-muted">Sem prévia do longo no Storage: o arquivo fica no PC.</div>
                )}
                <figcaption className="text-[11px] text-muted">
                  Longo · {formatDuration(job.outputs.long.durationSec)}
                  {job.outputs.long.localFile && ` · no PC: ${job.outputs.long.localFile}`}
                </figcaption>
              </figure>
            )}
            {job.outputs.vertical && (
              <figure className="flex flex-col gap-1.5">
                {urls.vertical && <video src={urls.vertical} controls preload="metadata" className="mx-auto aspect-[9/16] max-h-[420px] w-full rounded-xl bg-black object-contain" />}
                <figcaption className="text-[11px] text-muted">Vertical · {formatDuration(job.outputs.vertical.durationSec)}</figcaption>
              </figure>
            )}
          </section>
        )}

        {job.status === 'ready' && (
          <section aria-label="Texto" className="flex flex-col gap-3">
            <Field label="Título (YouTube e Facebook)" htmlFor="review-title">
              <Input id="review-title" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Legenda / descrição" htmlFor="review-caption" hint="Sugestão do estúdio; edite à vontade. No TikTok a legenda é escrita no app, junto do rascunho.">
              <Textarea id="review-caption" rows={6} maxLength={5000} value={caption} onChange={(event) => setCaption(event.target.value)} />
            </Field>
            {dirty && (
              <div>
                <Button size="sm" loading={saving} onClick={() => void save()}>
                  Salvar texto
                </Button>
              </div>
            )}
          </section>
        )}

        {job.status === 'ready' && (
          <section aria-labelledby="review-publish" className="flex flex-col gap-3">
            <h3 id="review-publish" className="text-sm font-semibold text-ink">
              Publicar
            </h3>
            {capable.length === 0 && <Alert tone="info">Nenhuma conta conectada. Conecte Instagram, Facebook, TikTok ou YouTube em Contas conectadas.</Alert>}
            {capable.map((connection) => (
              <PublishRow key={connection.id} studio={studio} job={{ ...job, title, caption }} connection={connection} dirty={dirty} onQueued={onQueued} />
            ))}
          </section>
        )}

        {scheduled.length > 0 && (
          <section aria-labelledby="review-queue" className="flex flex-col gap-2">
            <h3 id="review-queue" className="text-sm font-semibold text-ink">
              Na fila
            </h3>
            <ul className="flex flex-col gap-2">
              {scheduled.map((item) => {
                const connection = connections.find((entry) => entry.id === item.connectionId);
                const info = jobStatusInfo(item.status, connection?.platform);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
                    <Badge tone={info.tone}>{info.label}</Badge>
                    <span className="text-ink">{connection ? `${SOCIAL_PLATFORM_LABELS[connection.platform]} · ${connection.displayName || connection.username}` : 'Conta removida'}</span>
                    <span className="text-muted">{new Date(item.postAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span>
                    {item.permalink && (
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline">
                        Abrir <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                    {item.lastError && <span className="w-full text-amber-800 dark:text-amber-200">{item.lastError}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {job.log && (
          <details className="rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted">Log do estúdio</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink">{job.log}</pre>
          </details>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Drawer>
  );
}

interface RowProps {
  studio: StudioService;
  job: VideoJob;
  connection: SocialConnection;
  dirty: boolean;
  onQueued: (job: PublishingJob) => void;
}

const DEFAULT_TIME = '19:00';

/** Today at 19:00 when it is still ahead (with room for the 5-minute rule), otherwise tomorrow at 19:00. */
function firstSlot(now: Date): { day: string; time: string } {
  const today = todayIso(now);
  if (saoPauloDate(today, DEFAULT_TIME).getTime() > now.getTime() + 10 * 60_000) return { day: today, time: DEFAULT_TIME };
  return { day: todayIso(new Date(now.getTime() + 86_400_000)), time: DEFAULT_TIME };
}

/** One account: which format, when, and the problems that would block it, before anything is queued. */
function PublishRow({ studio, job, connection, dirty, onQueued }: RowProps) {
  const options = formatsFor(connection.platform).filter((format) => job.formats.includes(format));
  const [format, setFormat] = useState<VideoFormat>(options.includes('long') && connection.platform === 'youtube' ? 'long' : (options[0] ?? 'vertical'));
  const [first] = useState(() => firstSlot(new Date()));
  const [day, setDay] = useState(first.day);
  const [time, setTime] = useState(first.time);
  const [privacy, setPrivacy] = useState<VideoPrivacy>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const postAt = saoPauloDate(day, time || '00:00');
  const plan = { format, title: job.title, caption: job.caption, privacy, postAt };
  const problems = options.length ? videoPublishProblems(job, connection, plan, new Date()) : ['Esse pedido não tem formato que essa rede receba.'];
  const id = `publish-${connection.id}`;

  const schedule = async () => {
    setBusy(true);
    setError(null);
    try {
      onQueued(await studio.schedule(job, connection, plan, sendTimeFor(connection.platform, postAt)));
      setDone(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <p className="text-sm font-medium text-ink">
        {SOCIAL_PLATFORM_LABELS[connection.platform]} <span className="font-normal text-muted">· {connection.displayName || connection.username}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Formato" htmlFor={`${id}-format`}>
          <Select id={`${id}-format`} value={format} onChange={(event) => setFormat(event.target.value as VideoFormat)} disabled={options.length < 2}>
            {options.map((item) => (
              <option key={item} value={item}>
                {connection.platform === 'youtube' && item === 'vertical' ? 'Shorts' : VIDEO_FORMAT_LABELS[item].split(' (')[0]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dia" htmlFor={`${id}-day`}>
          <Input id={`${id}-day`} type="date" value={day} min={todayIso()} onChange={(event) => event.target.value && setDay(event.target.value)} />
        </Field>
        <Field label="Hora (Brasília)" htmlFor={`${id}-time`}>
          <Input id={`${id}-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
        {connection.platform === 'youtube' && (
          <Field label="Visibilidade" htmlFor={`${id}-privacy`}>
            <Select id={`${id}-privacy`} value={privacy} onChange={(event) => setPrivacy(event.target.value as VideoPrivacy)}>
              {(Object.keys(VIDEO_PRIVACY_LABELS) as VideoPrivacy[]).map((item) => (
                <option key={item} value={item}>
                  {VIDEO_PRIVACY_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {sendsToDrafts(connection.platform) && <p className="text-[11px] text-muted">Vai para os rascunhos do TikTok 10 minutos antes; você escreve a legenda e publica no app.</p>}
      {connection.platform === 'youtube' && <p className="text-[11px] text-muted">Quem envia é o estúdio no PC (o longo está lá). Enquanto o projeto do Google não for auditado, o YouTube deixa o vídeo privado: é só abrir no Studio e publicar.</p>}
      {problems.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-200">{problems.join(' ')}</p>}
      {error && <Alert>{error}</Alert>}
      <div>
        <Button size="sm" variant="primary" loading={busy} disabled={problems.length > 0 || dirty || done} onClick={() => void schedule()}>
          <Send className="size-3.5" aria-hidden /> {done ? 'Agendado' : dirty ? 'Salve o texto antes' : 'Aprovar e agendar'}
        </Button>
      </div>
    </div>
  );
}
