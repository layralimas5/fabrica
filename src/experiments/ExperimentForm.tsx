import { useState, type FormEvent } from 'react';
import { accountLabel, type Account } from '../domain/account';
import { PLATFORM_LABELS } from '../domain/carousel';
import { setVariables } from '../domain/experiments/brief';
import { EXPERIMENT_LIMITS, sanitizeExperimentInput, TEST_METRIC_LABELS, TEST_METRICS, TEST_VARIABLE_LABELS, TEST_VARIABLES, type ExperimentInput, type TestMetric } from '../domain/experiments/experiment';
import { VariableQuestionsFields } from './VariableQuestionsFields';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';
import { ChipGroup } from '../winners/chips';

interface ExperimentFormProps {
  initial: ExperimentInput;
  isNew: boolean;
  accounts: Account[];
  onClose: () => void;
  onSave: (input: ExperimentInput) => Promise<void>;
}

/** What is being tested (one or more things), why, and the two sides of each. */
export function ExperimentForm({ initial, isNew, accounts, onClose, onSave }: ExperimentFormProps) {
  // Older experiments only have one variable: reading them through the sanitizer fills the list.
  const [draft, setDraft] = useState(() => sanitizeExperimentInput(initial));
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
        <ChipGroup label="O que você está testando? (pode marcar mais de um)" options={TEST_VARIABLES} labelOf={(item) => TEST_VARIABLE_LABELS[item]} selected={draft.variables} onChange={(next) => next.length > 0 && setDraft((current) => setVariables(current, next))} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Hipótese" htmlFor="exp-hypothesis">
            <Textarea id="exp-hypothesis" rows={2} value={draft.hypothesis} maxLength={EXPERIMENT_LIMITS.hypothesis} onChange={(e) => set({ hypothesis: e.target.value })} placeholder="Ganchos contrarian geram mais compartilhamentos do que ganchos educativos." />
          </Field>
          <Field label="Métrica que decide" htmlFor="exp-metric">
            <Select id="exp-metric" value={draft.goalMetric} onChange={(e) => set({ goalMetric: e.target.value as TestMetric })}>
              {TEST_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {TEST_METRIC_LABELS[metric]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <VariableQuestionsFields idPrefix="exp" variables={draft.variables} details={draft.details} times={draft.times} onDetails={(details) => set({ details })} onTimes={(times) => set({ times })} />
        {error && <Alert>{error}</Alert>}
      </form>
    </Dialog>
  );
}
