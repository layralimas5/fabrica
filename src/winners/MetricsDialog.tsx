import { useState, type FormEvent } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Account } from '../domain/account';
import type { Carousel } from '../domain/carousel';
import { MeasurementTable } from '../analytics/MeasurementHistory';
import { measurementSteps } from '../domain/analytics/growth';
import { todayIso } from '../domain/schedule';
import { recordFromCarousel } from '../domain/winners/fromCarousel';
import {
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  sanitizePerformanceValue,
  sanitizeRecordInput,
  toRecordInput,
  withMeasurement,
  withoutMeasurement,
  type ContentRecord,
  type ContentRecordInput,
  type PerformanceKey,
  type PerformanceMetrics,
} from '../domain/winners/record';
import { Alert, Button, Dialog, Field, Input } from '../ui/primitives';

interface MetricsDialogProps {
  /** Carousel being measured; null for content made elsewhere, which always has a record. */
  carousel: Carousel | null;
  /** Results already typed for this carousel, if any. */
  existing: ContentRecord | null;
  account: Account | null;
  productName: string | null;
  onClose: () => void;
  onSaved: (record: ContentRecord) => void;
}

type Drafts = Record<PerformanceKey, string>;

const toDrafts = (metrics: PerformanceMetrics): Drafts => Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, metrics[key] === null ? '' : String(metrics[key])])) as Drafts;

/**
 * "Adicionar métricas": the numbers read on a given day. Each day becomes a measurement in the history,
 * so the Analytics can tell what is still growing. Empty means not measured.
 */
export function MetricsDialog({ carousel, existing, account, productName, onClose, onSaved }: MetricsDialogProps) {
  const { contentRecords } = useServices();
  const today = todayIso();
  const [base, setBase] = useState<ContentRecordInput>(() => sanitizeRecordInput(existing ? toRecordInput(existing) : carousel ? { ...recordFromCarousel(carousel, account, productName), winner: false } : {}));
  const [day, setDay] = useState(today);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(base.metrics));
  const [publishedAt, setPublishedAt] = useState(base.publishedAt ?? carousel?.scheduledFor ?? today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = measurementSteps({ ...base, publishedAt, id: '', createdAt: '', updatedAt: '' });
  const editingDay = base.metricsHistory.some((snapshot) => snapshot.day === day);

  /** Picking a day already measured opens its numbers to fix them. */
  const chooseDay = (next: string) => {
    setDay(next);
    const snapshot = base.metricsHistory.find((item) => item.day === next);
    if (snapshot) setDrafts(toDrafts(snapshot.metrics));
  };
  const removeDay = (removed: string) => setBase((current) => withoutMeasurement(current, removed));

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
    if (!day || day > today) return setError('A data da medição não pode ser no futuro.');
    if (publishedAt && day < publishedAt) return setError('A medição não pode ser antes do dia em que o post foi publicado.');

    setPending(true);
    setError(null);
    try {
      const input = sanitizeRecordInput(withMeasurement({ ...base, publishedAt }, day, metrics));
      onSaved(existing ? await contentRecords.update(existing.id, input) : await contentRecords.create(input));
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  return (
    <Dialog
      title={existing ? 'Nova medição' : 'Adicionar métricas'}
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
        <p className="text-sm text-muted">
          Coloque os números como estão no app no dia da medição. Cada data vira um ponto no histórico, e o Analytics compara o quanto o post cresceu entre elas.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="Medido em" htmlFor="metrics-day" hint={editingDay ? 'Já tem medição nesse dia: salvar substitui.' : undefined}>
            <Input id="metrics-day" type="date" value={day} min={publishedAt || undefined} max={today} onChange={(e) => chooseDay(e.target.value)} />
          </Field>
          <Field label="Publicado em" htmlFor="metrics-date">
            <Input id="metrics-date" type="date" value={publishedAt} max={today} onChange={(e) => setPublishedAt(e.target.value)} />
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
        {steps.length > 0 && (
          <section aria-labelledby="metrics-history-title" className="flex flex-col gap-2">
            <h3 id="metrics-history-title" className="text-sm font-semibold text-ink">
              Histórico de medições
            </h3>
            <MeasurementTable steps={steps} onRemove={removeDay} />
            <p className="text-[11px] text-faint">Apagar uma linha só vale depois de salvar.</p>
          </section>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Dialog>
  );
}
