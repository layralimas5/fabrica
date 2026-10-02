import { CheckCircle2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../app/useResource';
import type { Experiment } from '../domain/experiments/experiment';
import { winnerPlan, type DimensionLeader, type WinnerPlan } from '../domain/experiments/winner';
import { Alert, Button, Dialog } from '../ui/primitives';

interface ApplyWinnerProps {
  experiment: Experiment;
  /** Leader of each part of the test; empty while no part has two measured versions. */
  leaders: DimensionLeader[];
  /** The account the defaults belong to is missing (a test across accounts only gets the learning). */
  hasAccount: boolean;
  onApply: (plan: WinnerPlan) => Promise<void>;
}

/** "Aplicar o vencedor": the result changes the next creations instead of staying written down. */
export function ApplyWinner({ experiment, leaders, hasAccount, onApply }: ApplyWinnerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = winnerPlan(experiment, leaders);
  const changes = hasAccount ? plan.changes : plan.changes.filter((change) => !change.includes('padrão da conta'));

  if (experiment.appliedWinner) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Vencedor aplicado: {experiment.appliedWinner}
          {leaders.length > 0 && (
            <button type="button" onClick={() => setOpen(true)} className="ml-2 font-medium underline underline-offset-2">
              Aplicar de novo
            </button>
          )}
        </span>
        {open && <Confirm changes={changes} learning={plan.learning} pending={pending} error={error} onClose={() => setOpen(false)} onConfirm={confirm} />}
      </p>
    );
  }
  if (leaders.length === 0) return null;

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onApply(hasAccount ? plan : { ...plan, defaults: {}, changes });
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} className="mt-3">
        <Wand2 className="size-4" aria-hidden /> Aplicar o vencedor
      </Button>
      {open && <Confirm changes={changes} learning={plan.learning} pending={pending} error={error} onClose={() => setOpen(false)} onConfirm={confirm} />}
    </>
  );
}

function Confirm({ changes, learning, pending, error, onClose, onConfirm }: { changes: string[]; learning: string; pending: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      title="Aplicar o vencedor"
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            Aplicar e concluir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">Isso muda as próximas criações da conta e conclui o teste:</p>
        <ul className="flex flex-col gap-1.5">
          {changes.map((change) => (
            <li key={change} className="text-ink">
              ✓ {change}
            </li>
          ))}
        </ul>
        {learning && (
          <p className="rounded-xl bg-subtle px-3 py-2 text-xs text-muted">
            Aprendizado salvo: <span className="text-ink">{learning}</span>
          </p>
        )}
        <p className="text-xs text-faint">Dá pra trocar o horário e o modelo de novo quando quiser, direto na Criar.</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}
