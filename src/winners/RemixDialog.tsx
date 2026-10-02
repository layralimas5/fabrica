import { Check, ClipboardCopy, ExternalLink, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { buildHandoff, remixBrand, type CreateHandoff, type WinnerContext } from '../application/winnerHandoff';
import { MAX_REMIX_PROMPT_CHARS } from '../domain/aiContract';
import { parseScript, splitCopies } from '../domain/script';
import { analyzeDna } from '../domain/winners/dna';
import type { ContentRecord } from '../domain/winners/record';
import {
  buildRemixPrompt,
  cleanThemes,
  defaultRemixRequest,
  FAMILY_THEME_SUGGESTIONS,
  KEEP_LABELS,
  KEEP_OPTIONS,
  MAX_FAMILY_THEMES,
  MAX_THEME_LENGTH,
  REMIX_MODE_LABELS,
  REMIX_MODES,
  remixCount,
  remixProblem,
  scriptsToCopies,
  VARIATION_COUNTS,
  VARY_LABELS,
  VARY_OPTIONS,
  type RemixMode,
  type RemixRequest,
} from '../domain/winners/remix';
import { Alert, Button, Dialog, Field, Input, Textarea } from '../ui/primitives';
import { Chip, ChipGroup } from './chips';

const CLAUDE_URL = 'https://claude.ai/new';
const COPIED_FEEDBACK_MS = 2000;

interface RemixDialogProps {
  open: boolean;
  onClose: () => void;
  initialMode: RemixMode;
  record: ContentRecord;
  context: WinnerContext;
  /** Themes already used in the library, offered as family members. */
  knownThemes: string[];
  onHandoff: (handoff: CreateHandoff) => void;
}

export function RemixDialog({ open, onClose, initialMode, record, context, knownThemes, onHandoff }: RemixDialogProps) {
  const { ai } = useServices();
  const [request, setRequest] = useState<RemixRequest>(() => defaultRemixRequest(initialMode));
  const [customTheme, setCustomTheme] = useState('');
  const [answer, setAnswer] = useState('');
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = ai.engine === 'claude';

  useEffect(() => {
    if (!open) return;
    setRequest(defaultRemixRequest(initialMode));
    setAnswer('');
    setGenerated(null);
    setError(null);
  }, [open, initialMode]);

  const dna = useMemo(() => record.dna ?? analyzeDna({ beats: record.script }), [record]);
  const problem = remixProblem(request);
  const prompt = useMemo(() => (dna ? buildRemixPrompt(record, dna, request, remixBrand(context.brand)) : ''), [dna, record, request, context.brand]);
  const pasted = useMemo(() => {
    const copies = splitCopies(answer);
    return { copies, carousels: copies.reduce((sum, copy) => sum + parseScript(copy).length, 0) };
  }, [answer]);
  const themeOptions = useMemo(() => [...new Set([...FAMILY_THEME_SUGGESTIONS, ...knownThemes.map((theme) => theme.toLowerCase())])], [knownThemes]);

  const set = (patch: Partial<RemixRequest>) => {
    setRequest((current) => ({ ...current, ...patch }));
    setGenerated(null);
  };

  const changeMode = (mode: RemixMode) => setRequest((current) => ({ ...defaultRemixRequest(mode), keep: current.keep }));

  const addTheme = () => {
    const theme = customTheme.trim();
    if (!theme) return;
    set({ themes: cleanThemes([...request.themes, theme]).slice(0, MAX_FAMILY_THEMES) });
    setCustomTheme('');
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setError('O navegador bloqueou a cópia. Seleciona o texto do prompt e copia com Ctrl+C.');
    }
  };

  const generate = async () => {
    if (problem) return setError(problem);
    if (prompt.length > MAX_REMIX_PROMPT_CHARS) return setError('Esse conteúdo é longo demais pra mandar de uma vez. Encurta o roteiro e tenta de novo.');
    setPending(true);
    setError(null);
    try {
      const scripts = await ai.remixContent({ prompt, count: remixCount(request) });
      setGenerated(scriptsToCopies(scripts));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const send = (copies: string[]) => {
    if (problem) return setError(problem);
    if (copies.length === 0) return setError('Não reconheci nenhum carrossel. A resposta precisa ter linhas como "CARROSSEL 1: título" e "Slide 1, texto".');
    onHandoff(buildHandoff(record, context, request, copies));
  };

  const footer = writes ? (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      {generated ? (
        <Button variant="primary" onClick={() => send(generated)}>
          Abrir {generated.length} na tela Criar
        </Button>
      ) : (
        <Button variant="primary" loading={pending} disabled={!dna} onClick={() => void generate()}>
          Gerar {remixCount(request) > 1 ? `${remixCount(request)} conteúdos` : 'conteúdo'}
        </Button>
      )}
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button variant="primary" disabled={!dna || pasted.copies.length === 0} onClick={() => send(pasted.copies)}>
        {pasted.carousels > 0 ? `Abrir ${pasted.carousels} na tela Criar` : 'Abrir na tela Criar'}
      </Button>
    </>
  );

  return (
    <Dialog title={REMIX_MODE_LABELS[request.mode]} open={open} onClose={onClose} size="lg" footer={footer}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="O que criar">
          {REMIX_MODES.map((mode) => (
            <Chip key={mode} active={request.mode === mode} onClick={() => changeMode(mode)}>
              {REMIX_MODE_LABELS[mode]}
            </Chip>
          ))}
        </div>

        <p className="rounded-xl bg-subtle px-3.5 py-2.5 text-sm text-muted">
          Base: <span className="font-medium text-ink">“{record.hook || record.title}”</span>. O texto não é copiado: só o mecanismo que fez ele funcionar.
        </p>

        {!dna && <Alert>Esse conteúdo não tem roteiro pra analisar. Edita e cola o roteiro (um slide ou cena por linha) antes de criar a partir dele.</Alert>}

        {request.mode === 'model' && (
          <Field label="Novo tema" htmlFor="remix-theme" hint={record.theme ? `Tema original: ${record.theme}` : undefined}>
            <Input
              id="remix-theme"
              autoFocus
              maxLength={MAX_THEME_LENGTH}
              value={request.themes[0] ?? ''}
              onChange={(e) => set({ themes: [e.target.value] })}
              placeholder="Hábitos sem objetivos"
            />
          </Field>
        )}

        {request.mode === 'variations' && (
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted">Quantas variações?</legend>
              <div className="flex gap-1.5">
                {VARIATION_COUNTS.map((count) => (
                  <Chip key={count} active={request.count === count} onClick={() => set({ count })}>
                    {count}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <Field label="Direção (opcional)" htmlFor="remix-direction">
              <Input id="remix-direction" maxLength={MAX_THEME_LENGTH} value={request.themes[0] ?? ''} onChange={(e) => set({ themes: [e.target.value] })} placeholder="Ex.: foco em quem trabalha e estuda" />
            </Field>
          </div>
        )}

        {request.mode === 'family' && (
          <div className="flex flex-col gap-3">
            <ChipGroup
              label={`Temas da família (${cleanThemes(request.themes).length} de até ${MAX_FAMILY_THEMES})`}
              options={[...new Set([...themeOptions, ...request.themes])]}
              labelOf={(theme) => theme}
              selected={request.themes}
              onChange={(themes) => set({ themes: themes.slice(0, MAX_FAMILY_THEMES) })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <Field label="Outro tema" htmlFor="remix-custom-theme" className="flex-1">
                  <Input
                    id="remix-custom-theme"
                    maxLength={MAX_THEME_LENGTH}
                    value={customTheme}
                    onChange={(e) => setCustomTheme(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTheme();
                      }
                    }}
                    placeholder="autossabotagem"
                  />
                </Field>
                <Button variant="secondary" aria-label="Adicionar tema" onClick={addTheme}>
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>
              <Field label="Nome da família" htmlFor="remix-family">
                <Input id="remix-family" maxLength={MAX_THEME_LENGTH} value={request.familyName} onChange={(e) => set({ familyName: e.target.value })} placeholder={`Família “${record.title}”`} />
              </Field>
            </div>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <ChipGroup label="Manter" options={KEEP_OPTIONS} labelOf={(option) => KEEP_LABELS[option]} selected={request.keep} onChange={(keep) => set({ keep })} />
          <ChipGroup label="Variar" options={VARY_OPTIONS} labelOf={(option) => VARY_LABELS[option]} selected={request.vary} onChange={(vary) => set({ vary })} />
        </div>

        {dna && !writes && (
          <section className="flex flex-col gap-3 border-t border-line pt-5" aria-labelledby="remix-prompt-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="remix-prompt-title" className="text-sm font-semibold text-ink">
                  1. Copie o prompt e cole no Claude
                </h3>
                <p className="mt-0.5 text-xs text-muted">A Fábrica está no modo local, sem IA que escreve. O prompt já leva o DNA e pede a resposta no formato certo.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={Boolean(problem)} onClick={() => void copyPrompt()}>
                  {copied ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
                  {copied ? 'Copiado' : 'Copiar prompt'}
                </Button>
                <a
                  href={CLAUDE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Abrir Claude <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(abre em outra aba)</span>
                </a>
              </div>
            </div>
            {problem ? (
              <p className="text-xs text-faint">{problem}</p>
            ) : (
              <Textarea aria-label="Prompt pronto" readOnly rows={6} value={prompt} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            )}
            <Field label="2. Cole a resposta aqui" htmlFor="remix-answer" hint={pasted.carousels > 0 ? `${pasted.carousels} carrossel(éis) reconhecido(s). Revise na tela Criar antes de gerar.` : undefined}>
              <Textarea id="remix-answer" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={'CARROSSEL 1: …\nSlide 1, …'} />
            </Field>
          </section>
        )}

        {writes && generated && (
          <section className="flex flex-col gap-2 border-t border-line pt-5" aria-label="Conteúdos gerados">
            {generated.map((copy, index) => {
              const [parsed] = parseScript(copy);
              return (
                <div key={index} className="rounded-xl border border-line px-3.5 py-2.5">
                  <p className="text-sm font-medium text-ink">{parsed?.title || `Conteúdo ${index + 1}`}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{parsed?.slides[0]}</p>
                </div>
              );
            })}
          </section>
        )}

        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}
