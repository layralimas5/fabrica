import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { errorMessage } from '../app/useResource';
import { accountLabel } from '../domain/account';
import { emptyExperiment } from '../domain/experiments/experiment';
import { ExperimentForm } from '../experiments/ExperimentForm';
import { ExperimentCard, Learnings, TestMap } from '../experiments/ExperimentViews';
import { useExperimentLab } from '../experiments/useExperimentLab';
import { PendingMeasurementsList } from '../experiments/PendingMeasurements';
import { pendingMeasurements } from '../domain/experiments/followUp';
import { todayIso } from '../domain/schedule';
import { useAddMetrics } from '../winners/useAddMetrics';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';


export function ExperimentsPage() {
  const lab = useExperimentLab();
  const scope = useAccountScope();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metrics = useAddMetrics((saved) => lab.library.records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]));

  if (lab.loading || scope.loading) return <Spinner label="Carregando os testes" />;

  const visible = lab.experiments.filter((experiment) => !scope.current || !experiment.accountId || experiment.accountId === scope.current.id);
  const accountName = (accountId: string | null) => {
    const account = scope.accounts.find((item) => item.id === accountId);
    return account ? accountLabel(account) : 'Várias contas';
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Testes"
        description="Uma variável por vez, uma hipótese clara e o aprendizado registrado. É assim que cada semana ensina a próxima."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Novo experimento
          </Button>
        }
      />
      {(error ?? lab.error) && (
        <div className="mb-4">
          <Alert>{error ?? lab.error}</Alert>
        </div>
      )}

      <PendingMeasurementsList pending={pendingMeasurements(lab.library.items, visible, todayIso())} onMeasure={metrics.open} />

      <TestMap experiments={visible} />

      {visible.length === 0 ? (
        <EmptyState
          title="Nenhum teste ainda"
          description="Crie um experimento, diga o que está testando e coloque os conteúdos nele pelo editor, pelo Calendário ou aqui no detalhe do teste."
        />
      ) : (
        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {visible.map((experiment) => (
            <li key={experiment.id}>
              <ExperimentCard experiment={experiment} result={lab.resultOf(experiment)} accountName={accountName(experiment.accountId)} />
            </li>
          ))}
        </ul>
      )}

      <Learnings experiments={visible} accountName={accountName} />

      {metrics.dialog}

      {creating && (
        <ExperimentForm
          initial={emptyExperiment(scope.current?.id ?? null)}
          isNew
          accounts={scope.active}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            try {
              const saved = await lab.create(input);
              setCreating(false);
              navigate(`/testes/${saved.id}`);
            } catch (cause) {
              setError(errorMessage(cause));
            }
          }}
        />
      )}
    </div>
  );
}

