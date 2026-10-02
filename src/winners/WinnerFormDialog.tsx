import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Account } from '../domain/account';
import { analyzeDna, classifyHook } from '../domain/winners/dna';
import { scriptFromText, scriptToText } from '../domain/winners/fromCarousel';
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMATS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  HOOK_TYPE_LABELS,
  HOOK_TYPES,
  LIMITS,
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  PILLAR_LABELS,
  PILLARS,
  PRODUCT_PRESENCE_LABELS,
  PRODUCT_PRESENCES,
  sanitizePerformanceValue,
  sanitizeRecordInput,
  WINNER_TYPE_INFO,
  WINNER_TYPES,
  type ContentRecord,
  type ContentRecordInput,
  type PerformanceKey,
  type PerformanceMetrics,
} from '../domain/winners/record';
import { suggestWinnerTypes } from '../domain/winners/score';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';
import { Chip, ChipGroup } from './chips';

interface WinnerFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Starting values: from a carousel, an existing record or empty for content made elsewhere. */
  initial: ContentRecordInput;
  /** Set when editing an existing record. */
  recordId: string | null;
  accounts: Account[];
  /** Records already saved: theme suggestions and the comparison base for winner types. */
  library: ContentRecord[];
  title?: string;
  onSaved: (record: ContentRecord) => void;
}

type MetricDrafts = Record<PerformanceKey, string>;

const toDrafts = (metrics: PerformanceMetrics): MetricDrafts =>
  Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, metrics[key] === null ? '' : String(metrics[key])])) as MetricDrafts;

function parseDrafts(drafts: MetricDrafts): { metrics: PerformanceMetrics; invalid: PerformanceKey[] } {
  const invalid: PerformanceKey[] = [];
  const metrics = Object.fromEntries(
    PERFORMANCE_KEYS.map((key) => {
      const raw = drafts[key].trim();
      const value = sanitizePerformanceValue(key, raw);
      if (raw && value === null) invalid.push(key);
      return [key, value];
    }),
  ) as PerformanceMetrics;
  return { metrics, invalid };
}

export function WinnerFormDialog({ open, onClose, initial, recordId, accounts, library, title, onSaved }: WinnerFormDialogProps) {
  const { contentRecords } = useServices();
  const [form, setForm] = useState<ContentRecordInput>(initial);
  const [scriptText, setScriptText] = useState(() => scriptToText(initial.script));
  const [drafts, setDrafts] = useState<MetricDrafts>(() => toDrafts(initial.metrics));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const external = initial.carouselId === null;

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setScriptText(scriptToText(initial.script));
    setDrafts(toDrafts(initial.metrics));
    setError(null);
  }, [open, initial]);

  const update = (patch: Partial<ContentRecordInput>) => setForm((current) => ({ ...current, ...patch }));
  const themes = useMemo(() => [...new Set(library.map((record) => record.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [library]);
  const platformAccounts = accounts.filter((account) => form.platform === 'outros' || account.platform === form.platform);
  const comparison = library.filter((record) => record.id !== recordId).map((record) => record.metrics);

  const suggestTypes = () => {
    const suggested = suggestWinnerTypes(parseDrafts(drafts).metrics, comparison);
    update({ winnerTypes: [...new Set([...form.winnerTypes, ...suggested])] });
    if (suggested.length === 0) setError('Os números ainda não destacam nenhum tipo. Marque à mão, ou cadastre mais conteúdos pra ter base de comparação.');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { metrics, invalid } = parseDrafts(drafts);
    if (invalid.length) return setError(`Confere: ${invalid.map((key) => PERFORMANCE_LABELS[key].toLowerCase()).join(', ')} precisa ser um número positivo.`);

    const script = external ? scriptFromText(scriptText) : form.script;
    const hook = form.hook.trim() || script[0]?.text || '';
    if (!form.title.trim() && !hook) return setError('Dá um título ou escreve o gancho pra reconhecer esse conteúdo depois.');

    // Content made elsewhere has its DNA redone when the script changes, unless the user already edited it.
    const scriptChanged = external && scriptToText(script) !== scriptToText(initial.script);
    const dna = scriptChanged && form.dna?.source !== 'edited' ? analyzeDna({ beats: script }) : form.dna;
    const input = sanitizeRecordInput({
      ...form,
      title: form.title.trim() || hook,
      hook,
      script,
      metrics,
      dna,
      hookType: form.hookType ?? (hook ? classifyHook(hook) : null),
      slideCount: form.slideCount ?? (script.length || null),
    });

    setPending(true);
    setError(null);
    try {
      const saved = recordId ? await contentRecords.update(recordId, input) : await contentRecords.create(input);
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const formId = 'winner-form';
  return (
    <Dialog
      title={title ?? (recordId ? 'Editar conteúdo' : '⭐ Marcar como vencedor')}
      open={open}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={form.winner} onClick={() => update({ winner: !form.winner })}>
              ⭐ Vencedor
            </Chip>
            <Chip active={form.favorite} onClick={() => update({ favorite: !form.favorite })}>
              ♥ Favorito
            </Chip>
            <Chip active={form.mainModel} onClick={() => update({ mainModel: !form.mainModel })}>
              🏆 Modelo principal
            </Chip>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título" htmlFor="wf-title">
              <Input id="wf-title" value={form.title} maxLength={LIMITS.title} onChange={(e) => update({ title: e.target.value })} placeholder="Nome pra achar depois" />
            </Field>
            <Field label="Gancho (primeira frase)" htmlFor="wf-hook">
              <Input id="wf-hook" value={form.hook} maxLength={LIMITS.hook} onChange={(e) => update({ hook: e.target.value })} placeholder="Você não tem problema de disciplina." />
            </Field>
          </div>
          {external && (
            <Field label="Roteiro" htmlFor="wf-script" hint="Um slide ou uma cena por linha. É daqui que sai a estrutura (DNA).">
              <Textarea id="wf-script" rows={5} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder={'Você não tem problema de disciplina.\nVocê começa a semana cheia de planos…'} />
            </Field>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-ink">Publicação</h3>
          <ChipGroup label="Plataforma" options={CONTENT_PLATFORMS} labelOf={(item) => CONTENT_PLATFORM_LABELS[item]} selected={[form.platform]} onChange={(next) => next[0] && update({ platform: next[0] })} single />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Conta / perfil" htmlFor="wf-account">
              <Select id="wf-account" value={form.accountId ?? ''} onChange={(e) => update({ accountId: e.target.value || null })}>
                <option value="">Outra (digitar)</option>
                {platformAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · @{account.handle}
                  </option>
                ))}
              </Select>
            </Field>
            {!form.accountId && (
              <Field label="Nome do perfil" htmlFor="wf-account-label">
                <Input id="wf-account-label" value={form.accountLabel} maxLength={LIMITS.accountLabel} onChange={(e) => update({ accountLabel: e.target.value })} placeholder="TikTok 2" />
              </Field>
            )}
            <Field label="Data de publicação" htmlFor="wf-date">
              <Input id="wf-date" type="date" value={form.publishedAt ?? ''} onChange={(e) => update({ publishedAt: e.target.value || null })} />
            </Field>
            <Field label="Formato" htmlFor="wf-format">
              <Select id="wf-format" value={form.format} onChange={(e) => update({ format: e.target.value as ContentRecordInput['format'] })}>
                {CONTENT_FORMATS.map((item) => (
                  <option key={item} value={item}>
                    {CONTENT_FORMAT_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tema" htmlFor="wf-theme">
              <Input id="wf-theme" list="wf-themes" value={form.theme} maxLength={LIMITS.theme} onChange={(e) => update({ theme: e.target.value })} placeholder="procrastinação" />
              <datalist id="wf-themes">
                {themes.map((theme) => (
                  <option key={theme} value={theme} />
                ))}
              </datalist>
            </Field>
            <Field label="Pilar de conteúdo" htmlFor="wf-pillar">
              <Select id="wf-pillar" value={form.pillar ?? ''} onChange={(e) => update({ pillar: (e.target.value || null) as ContentRecordInput['pillar'] })}>
                <option value="">Não definido</option>
                {PILLARS.map((item) => (
                  <option key={item} value={item}>
                    {PILLAR_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de gancho" htmlFor="wf-hook-type" hint={!form.hookType && form.hook ? `Sugestão: ${HOOK_TYPE_LABELS[classifyHook(form.hook)]}` : undefined}>
              <Select id="wf-hook-type" value={form.hookType ?? ''} onChange={(e) => update({ hookType: (e.target.value || null) as ContentRecordInput['hookType'] })}>
                <option value="">Detectar automaticamente</option>
                {HOOK_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {HOOK_TYPE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Produto" htmlFor="wf-product">
              <Select id="wf-product" value={form.productPresence ?? ''} onChange={(e) => update({ productPresence: (e.target.value || null) as ContentRecordInput['productPresence'] })}>
                <option value="">Não definido</option>
                {PRODUCT_PRESENCES.map((item) => (
                  <option key={item} value={item}>
                    {PRODUCT_PRESENCE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de slides" htmlFor="wf-slides">
              <Input
                id="wf-slides"
                type="number"
                inputMode="numeric"
                min={1}
                max={LIMITS.slides}
                value={form.slideCount ?? ''}
                onChange={(e) => update({ slideCount: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Resultados</h3>
            <p className="mt-0.5 text-xs text-muted">Preencha só o que você tem. Campo vazio conta como "não medido", não como zero.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {PERFORMANCE_KEYS.map((key) => (
              <Field key={key} label={PERFORMANCE_LABELS[key]} htmlFor={`wf-${key}`}>
                <Input
                  id={`wf-${key}`}
                  type="number"
                  inputMode={key === 'revenue' ? 'decimal' : 'numeric'}
                  min={0}
                  step={key === 'revenue' ? 0.01 : 1}
                  value={drafts[key]}
                  onChange={(e) => setDrafts((current) => ({ ...current, [key]: e.target.value }))}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Tipo de vencedor</h3>
              <p className="mt-0.5 text-xs text-muted">Pode ser mais de um. Atenção e conversão são vitórias diferentes.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={suggestTypes}>
              Sugerir pelos números
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WINNER_TYPES.map((type) => (
              <Chip
                key={type}
                active={form.winnerTypes.includes(type)}
                onClick={() => update({ winnerTypes: form.winnerTypes.includes(type) ? form.winnerTypes.filter((item) => item !== type) : [...form.winnerTypes, type] })}
              >
                {WINNER_TYPE_INFO[type].emoji} {WINNER_TYPE_INFO[type].short}
              </Chip>
            ))}
          </div>
        </section>

        <Field label="Observações" htmlFor="wf-notes">
          <Textarea id="wf-notes" rows={3} value={form.notes} maxLength={LIMITS.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="O que você acha que fez esse conteúdo funcionar?" />
        </Field>

        {error && <Alert>{error}</Alert>}
      </form>
    </Dialog>
  );
}
