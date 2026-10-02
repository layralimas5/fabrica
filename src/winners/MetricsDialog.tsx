import { useState, type FormEvent } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Account } from '../domain/account';
import type { Carousel } from '../domain/carousel';
import { recordFromCarousel } from '../domain/winners/fromCarousel';
import {
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  sanitizePerformanceValue,
  sanitizeRecordInput,
  toRecordInput,
  type ContentRecord,
  type PerformanceKey,
  type PerformanceMetrics,
} from '../domain/winners/record';
import { Alert, Button, Dialog, Field, Input } from '../ui/primitives';

interface MetricsDialogProps {
  carousel: Carousel;
  /** Results already typed for this carousel, if any. */
  existing: ContentRecord | null;
  account: Account | null;
  productName: string | null;
  onClose: () => void;
  onSaved: (record: ContentRecord) => void;
}

type Drafts = Record<PerformanceKey, string>;

/** "Adicionar métricas": only the numbers, updatable as the post keeps growing. Empty means not measured. */
export function MetricsDialog({ carousel, existing, account, productName, onClose, onSaved }: MetricsDialogProps) {
  const { contentRecords } = useServices();
  const base = existing ? toRecordInput(existing) : { ...recordFromCarousel(carousel, account, productName), winner: false };
  const [drafts, setDrafts] = useState<Drafts>(() => Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, base.metrics[key] === null ? '' : String(base.metrics[key])])) as Drafts);
  const [publishedAt, setPublishedAt] = useState(base.publishedAt ?? carousel.scheduledFor ?? new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid: PerformanceKey[] = [];
    const metrics = Object.fromEntries(
      PERFORMANCE_KEYS.map((key) => {
        const raw = drafts[key].trim();
        const value = sanitizePerformanceValue(key, raw);
        if (raw && value === null) invalid.push(key);
        return [key, value];
      }),
    ) as PerformanceMetrics;
    if (invalid.length) return setError(`Confere: ${invalid.map((key) => PERFORMANCE_LABELS[key].toLowerCase()).join(', ')} precisa ser um número positivo.`);
    if (!metrics.views) return setError('Informe pelo menos as visualizações: as taxas são calculadas em cima delas.');

    setPending(true);
    setError(null);
    try {
      const input = sanitizeRecordInput({ ...base, metrics, publishedAt, metricsUpdatedAt: new Date().toISOString() });
      onSaved(existing ? await contentRecords.update(existing.id, input) : await contentRecords.create(input));
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  return (
    <Dialog
      title={existing ? 'Atualizar métricas' : 'Adicionar métricas'}
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="metrics-form" loading={pending}>
            Salvar métricas
          </Button>
        </>
      }
    >
      <form id="metrics-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-sm text-muted">Preencha só o que você tem. Dá pra voltar e atualizar quando o post crescer.</p>
          <Field label="Publicado em" htmlFor="metrics-date">
            <Input id="metrics-date" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PERFORMANCE_KEYS.map((key) => (
            <Field key={key} label={PERFORMANCE_LABELS[key]} htmlFor={`metric-${key}`}>
              <Input
                id={`metric-${key}`}
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
        {existing?.metricsUpdatedAt && (
          <p className="text-xs text-faint">Última atualização: {new Date(existing.metricsUpdatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Dialog>
  );
}
