import { useState, type FormEvent } from 'react';
import { accountLabel, type Account } from '../domain/account';
import { PLATFORM_LABELS } from '../domain/carousel';
import { EXPERIMENT_LIMITS, MAX_TEST_TIMES, sanitizeExperimentInput, TEST_METRIC_LABELS, TEST_METRICS, TEST_VARIABLE_LABELS, TEST_VARIABLES, type ExperimentInput, type TestMetric } from '../domain/experiments/experiment';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';
import { ChipGroup } from '../winners/chips';

interface ExperimentFormProps {
  initial: ExperimentInput;
  isNew: boolean;
  accounts: Account[];
  onClose: () => void;
  onSave: (input: ExperimentInput) => Promise<void>;
}

/** What is being tested, why, and the two versions. */
export function ExperimentForm({ initial, isNew, accounts, onClose, onSave }: ExperimentFormProps) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ExperimentInput>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = sanitizeExperimentInput(draft);
    if (!clean.name) return setError('Dá um nome pro teste, ex.: Teste de Gancho #03.');
    setPending(true);
    setError(null);
    try {
      await onSave(clean);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  };

  return (
    <Dialog
      title={isNew ? 'Novo experimento' : 'Editar experimento'}
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="experiment-form" loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="experiment-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" htmlFor="exp-name">
            <Input id="exp-name" autoFocus value={draft.name} maxLength={EXPERIMENT_LIMITS.name} onChange={(e) => set({ name: e.target.value })} placeholder="Teste de Gancho #03" />
          </Field>
          <Field label="Conta" htmlFor="exp-account" hint="O aprendizado fica no histórico dela.">
            <Select id="exp-account" value={draft.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || null })}>
              <option value="">Várias contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)} · {PLATFORM_LABELS[account.platform]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ChipGroup label="O que você está testando?" options={TEST_VARIABLES} labelOf={(item) => TEST_VARIABLE_LABELS[item]} selected={[draft.variable]} onChange={(next) => next[0] && set({ variable: next[0] })} single />
        <Field label="Hipótese" htmlFor="exp-hypothesis">
          <Textarea id="exp-hypothesis" rows={2} value={draft.hypothesis} maxLength={EXPERIMENT_LIMITS.hypothesis} onChange={(e) => set({ hypothesis: e.target.value })} placeholder="Ganchos contrarian geram mais compartilhamentos do que ganchos educativos." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Controle (versão original)" htmlFor="exp-control">
            <Input id="exp-control" value={draft.control} maxLength={EXPERIMENT_LIMITS.version} onChange={(e) => set({ control: e.target.value })} placeholder="5 hábitos para ter mais disciplina." />
          </Field>
          <Field label="Variação (versão testada)" htmlFor="exp-variation">
            <Input id="exp-variation" value={draft.variation} maxLength={EXPERIMENT_LIMITS.version} onChange={(e) => set({ variation: e.target.value })} placeholder="Você não precisa de mais disciplina." />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Métrica que decide" htmlFor="exp-metric">
            <Select id="exp-metric" value={draft.goalMetric} onChange={(e) => set({ goalMetric: e.target.value as TestMetric })}>
              {TEST_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {TEST_METRIC_LABELS[metric]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={draft.variable === 'horario' ? 'Horários testados' : 'Horário de postagem'} htmlFor="exp-time-0" hint={draft.variable === 'horario' ? `Até ${MAX_TEST_TIMES}; cada um é uma versão.` : 'Opcional.'}>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: draft.variable === 'horario' ? MAX_TEST_TIMES : 1 }, (_, index) => (
                <Input
                  key={index}
                  id={`exp-time-${index}`}
                  type="time"
                  aria-label={`Horário ${index + 1}`}
                  value={draft.times[index] ?? ''}
                  onChange={(e) => set({ times: Object.assign([...draft.times], { [index]: e.target.value }).filter(Boolean) })}
                  className="!w-32"
                />
              ))}
            </div>
          </Field>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Dialog>
  );
}
