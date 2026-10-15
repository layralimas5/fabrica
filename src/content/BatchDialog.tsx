import { ClipboardCopy, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { useBrandKits } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { CreateHandoff } from '../application/winnerHandoff';
import { brandContext } from '../application/brandContext';
import { BATCH_COUNTS, batchProblem, buildBatchPrompt, MAX_SLIDES, MIN_SLIDES, type BatchCount, type BatchRequest } from '../domain/batch/batch';
import { PLATFORM_LABELS, PLATFORMS, type CarouselFormat, type Platform } from '../domain/carousel';
import { OBJECTIVE_LABELS, OBJECTIVES, type Objective } from '../domain/content';
import { CONVERSION_GOAL_LABELS, sameProject } from '../domain/project';
import { parseScript, splitCopies } from '../domain/script';
import { scriptsToCopies } from '../domain/winners/remix';
import { copyText } from '../tracking/useTracking';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';

const FORMATS: { value: CarouselFormat; label: string }[] = [
  { value: '4:5', label: '4:5 · feed do Instagram' },
  { value: '9:16', label: '9:16 · TikTok e tela cheia' },
  { value: '1:1', label: '1:1 · quadrado' },
];

/**
 * Batch generation: project, objective, networks, quantity, tone and format become a briefing; Claude writes
 * the contents (or the prompt goes to any chat) and the create screen builds the visual pieces as usual.
 */
export function BatchDialog({ onClose, learnings = [] }: { onClose: () => void; learnings?: string[] }) {
  const { ai } = useServices();
  const scope = useAccountScope();
  const brands = useBrandKits();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(scope.project?.id ?? scope.projects[0]?.id ?? '');
  const project = scope.projects.find((item) => item.id === projectId) ?? null;
  const brand = brands.data.find((kit) => kit.id === project?.brandKitId) ?? null;
  const [objective, setObjective] = useState<Objective>('conversao');
  const [platforms, setPlatforms] = useState<Platform[]>(['instagram']);
  const [count, setCount] = useState<BatchCount>(5);
  const [tone, setTone] = useState('');
  const [format, setFormat] = useState<CarouselFormat>('4:5');
  const [slides, setSlides] = useState(7);
  const [direction, setDirection] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const writes = ai.engine === 'claude';

  const request: BatchRequest = {
    project: { name: project?.name ?? '', description: project?.description ?? '', landingUrl: project?.landingUrl ?? '', conversionGoal: project ? CONVERSION_GOAL_LABELS[project.conversionGoal] : '' },
    objective,
    platforms,
    count,
    tone: tone || (brand ? brandContext(brand).voice : ''),
    format,
    slides,
    direction,
  };
  const problem = batchProblem(request);
  const prompt = useMemo(() => buildBatchPrompt(request, learnings), [JSON.stringify(request), learnings]); // eslint-disable-line react-hooks/exhaustive-deps
  const pasted = useMemo(() => splitCopies(answer).filter((copy) => parseScript(copy).length > 0), [answer]);

  const handoff = (copies: string[]) => {
    const platform = platforms[0];
    const account = scope.active.find((item) => item.platform === platform && project && sameProject(item.project, project.name)) ?? null;
    const data: CreateHandoff = { copies, origin: null, settings: { platform, format, accountId: account?.id ?? null, brandKitId: project?.brandKitId ?? account?.brandKitId ?? null, style: null } };
    onClose();
    navigate('/criar', { state: { handoff: data } });
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const scripts = await ai.batchContent({ prompt, count });
      handoff(scriptsToCopies(scripts));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const togglePlatform = (platform: Platform) => setPlatforms((current) => (current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]));

  return (
    <Dialog
      open
      size="lg"
      title="Gerar em lote"
      onClose={onClose}
      footer={
        writes ? (
          <Button variant="primary" loading={busy} disabled={problem !== null} onClick={() => void generate()}>
            <Sparkles className="size-4" aria-hidden /> Gerar {count} carrosséis
          </Button>
        ) : (
          <Button variant="primary" disabled={pasted.length === 0} onClick={() => handoff(pasted)}>
            Levar {pasted.length || ''} para a tela Criar
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Projeto" htmlFor="batch-project">
          <Select id="batch-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {scope.projects.length === 0 && <option value="">Cadastre um projeto</option>}
            {scope.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objetivo" htmlFor="batch-objective">
          <Select id="batch-objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
            {OBJECTIVES.map((item) => (
              <option key={item} value={item}>
                {OBJECTIVE_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-medium text-muted">Redes</legend>
          <div className="flex gap-3 pt-1.5">
            {PLATFORMS.map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} className="size-4 accent-[var(--accent)]" />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Quantidade" htmlFor="batch-count">
          <Select id="batch-count" value={count} onChange={(e) => setCount(Number(e.target.value) as BatchCount)}>
            {BATCH_COUNTS.map((value) => (
              <option key={value} value={value}>
                {value} carrosséis
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Formato" htmlFor="batch-format">
          <Select id="batch-format" value={format} onChange={(e) => setFormat(e.target.value as CarouselFormat)}>
            {FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Slides por carrossel" htmlFor="batch-slides">
          <Input id="batch-slides" type="number" min={MIN_SLIDES} max={MAX_SLIDES} value={slides} onChange={(e) => setSlides(Number(e.target.value))} />
        </Field>
        <Field label="Tom de voz" htmlFor="batch-tone" className="sm:col-span-2" hint={brand ? `Vazio usa o tom do Brand Kit ${brand.name}.` : undefined}>
          <Input id="batch-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Direto, conversado, primeira pessoa" />
        </Field>
        <Field label="Direção (opcional)" htmlFor="batch-direction" className="sm:col-span-2">
          <Textarea id="batch-direction" rows={2} value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="Temas, dores, uma oferta do mês…" />
        </Field>
      </div>
      {learnings.length > 0 && (
        <div className="mt-4 rounded-xl bg-subtle p-3 text-xs text-muted">
          <p className="mb-1 font-medium text-ink">Vai junto no briefing (dados reais das contas):</p>
          <ul className="list-disc pl-4">
            {learnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {problem && <p className="mt-4 text-xs text-amber-800 dark:text-amber-200">{problem}</p>}
      {!writes && !problem && (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-muted">Com o motor local, copie o prompt, cole no Claude e traga a resposta aqui. A Fábrica lê o formato CARROSSEL N / Slide N.</p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void copyText(prompt).then((ok) => {
                  setMessage(ok ? 'Prompt copiado.' : 'O navegador bloqueou a cópia.');
                  setTimeout(() => setMessage(null), 2000);
                })
              }
            >
              <ClipboardCopy className="size-3.5" aria-hidden /> Copiar prompt
            </Button>
            {message && <span className="ml-2 text-xs text-muted">{message}</span>}
          </div>
          <Field label="Resposta do Claude" htmlFor="batch-answer" hint={pasted.length ? `${pasted.length} carrossel(éis) reconhecido(s).` : undefined}>
            <Textarea id="batch-answer" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="CARROSSEL 1: …" />
          </Field>
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
