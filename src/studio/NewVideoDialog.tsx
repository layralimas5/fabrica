import clsx from 'clsx';
import { useState } from 'react';
import type { StudioService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import type { Project } from '../domain/project';
import {
  channelById,
  sanitizeVideoJobInput,
  STUDIO_CHANNELS,
  VIDEO_FORMAT_LABELS,
  VIDEO_FORMATS,
  VIDEO_MODE_LABELS,
  videoJobProblems,
  type VideoFormat,
  type VideoJob,
  type VideoJobInput,
  type VideoMode,
} from '../domain/studio/videoJob';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';

interface Props {
  studio: StudioService;
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreated: (job: VideoJob) => void;
}

const BRIEF_HINT = 'Tema, ângulo, para quem é, o que a pessoa deve fazer no fim (CTA). O estúdio também recebe o que mais funcionou nos posts medidos do projeto.';

export function NewVideoDialog({ studio, projects, defaultProjectId, onClose, onCreated }: Props) {
  const [input, setInput] = useState<VideoJobInput>({ projectId: defaultProjectId, channel: 'nivora', mode: 'create', title: '', brief: '', formats: ['long', 'vertical'], compositions: {} });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channel = channelById(input.channel);
  const problems = videoJobProblems(input);
  const set = (patch: Partial<VideoJobInput>) => setInput((current) => ({ ...current, ...patch }));

  const pickChannel = (id: string) => {
    const next = channelById(id);
    set({ channel: id, mode: next && !next.modes.includes(input.mode) ? next.modes[0] : input.mode });
  };

  const toggleFormat = (format: VideoFormat) => set({ formats: input.formats.includes(format) ? input.formats.filter((item) => item !== format) : [...input.formats, format] });

  const submit = async () => {
    setTouched(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await studio.createJob(sanitizeVideoJobInput(input)));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="lg"
      title="Novo vídeo para o estúdio"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Mandar para o estúdio
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Canal" htmlFor="video-channel" hint={channel?.note}>
          <Select id="video-channel" value={input.channel} onChange={(event) => pickChannel(event.target.value)}>
            {STUDIO_CHANNELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Projeto" htmlFor="video-project" hint="Liga o vídeo às contas e aos resultados do projeto.">
          <Select id="video-project" value={input.projectId ?? ''} onChange={(event) => set({ projectId: event.target.value || null })}>
            <option value="">Sem projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título" htmlFor="video-title" className="sm:col-span-2">
          <Input id="video-title" value={input.title} maxLength={120} placeholder="Ex.: Como criar um SaaS sem programar" onChange={(event) => set({ title: event.target.value })} />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">O que o estúdio faz</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['create', 'render'] as VideoMode[]).map((mode) => {
              const allowed = channel?.modes.includes(mode) ?? false;
              return (
                <label
                  key={mode}
                  className={clsx(
                    'flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm focus-within:ring-2 focus-within:ring-accent',
                    input.mode === mode ? 'border-ink bg-subtle/60' : 'border-line',
                    !allowed && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input type="radio" name="video-mode" className="mt-0.5 accent-current" checked={input.mode === mode} disabled={!allowed} onChange={() => set({ mode })} />
                  <span>{VIDEO_MODE_LABELS[mode]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium text-muted">Formatos</legend>
          <div className="flex flex-wrap gap-2">
            {VIDEO_FORMATS.map((format) => (
              <label key={format} className={clsx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-accent', input.formats.includes(format) ? 'border-ink bg-subtle/60' : 'border-line')}>
                <input type="checkbox" className="accent-current" checked={input.formats.includes(format)} onChange={() => toggleFormat(format)} />
                {VIDEO_FORMAT_LABELS[format]}
              </label>
            ))}
          </div>
        </fieldset>

        {input.mode === 'create' ? (
          <Field label="Briefing" htmlFor="video-brief" hint={BRIEF_HINT} className="sm:col-span-2">
            <Textarea id="video-brief" rows={6} maxLength={4000} value={input.brief} onChange={(event) => set({ brief: event.target.value })} />
          </Field>
        ) : (
          <>
            {input.formats.map((format) => (
              <Field key={format} label={`Composição ${format === 'long' ? 'longa' : 'vertical'}`} htmlFor={`video-comp-${format}`} hint="Id no Root.tsx do projeto de vídeos.">
                <Input id={`video-comp-${format}`} value={input.compositions[format] ?? ''} placeholder={format === 'long' ? 'TutorialCanal' : 'SaasSemCodigoReels'} onChange={(event) => set({ compositions: { ...input.compositions, [format]: event.target.value } })} />
              </Field>
            ))}
            <Field label="Observações (opcional)" htmlFor="video-brief" className="sm:col-span-2">
              <Textarea id="video-brief" rows={2} maxLength={4000} value={input.brief} onChange={(event) => set({ brief: event.target.value })} />
            </Field>
          </>
        )}
        <button type="submit" hidden />
      </form>

      {touched && problems.length > 0 && (
        <div className="mt-4">
          <Alert>
            <ul className="list-disc pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Dialog>
  );
}
