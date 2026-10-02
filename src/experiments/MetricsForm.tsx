import { useState, type FormEvent } from 'react';
import { emptyMetrics, METRIC_KEYS, METRIC_LABELS, sanitizeMetric, type MetricKey, type Metrics } from '../domain/metrics';
import { Alert, Button, Field, Input } from '../ui/primitives';

interface MetricsFormProps {
  idPrefix: string;
  initial: Metrics | null;
  onSave: (metrics: Metrics) => Promise<void>;
}

/** Manual entry of the numbers the platform shows after posting. */
export function MetricsForm({ idPrefix, initial, onSave }: MetricsFormProps) {
  const [values, setValues] = useState<Record<MetricKey, string>>(() => {
    const base = initial ?? emptyMetrics();
    return Object.fromEntries(METRIC_KEYS.map((key) => [key, base[key] ? String(base[key]) : ''])) as Record<MetricKey, string>;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const metrics: Metrics = { ...emptyMetrics() };
    for (const key of METRIC_KEYS) metrics[key] = sanitizeMetric(Number(values[key] || 0));
    if (metrics.views === 0) return setError('Informe pelo menos as visualizações.');

    setPending(true);
    setError(null);
    try {
      await onSave(metrics);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-2">
        {METRIC_KEYS.map((key) => (
          <Field key={key} label={METRIC_LABELS[key]} htmlFor={`${idPrefix}-${key}`}>
            <Input
              id={`${idPrefix}-${key}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values[key]}
              onChange={(e) => {
                setSaved(false);
                setValues((current) => ({ ...current, [key]: e.target.value }));
              }}
            />
          </Field>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant={saved ? 'secondary' : 'primary'} loading={pending}>
        {saved ? 'Métricas salvas' : 'Salvar métricas'}
      </Button>
    </form>
  );
}
