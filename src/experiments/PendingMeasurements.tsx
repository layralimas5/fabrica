import { BarChart3, ClipboardList } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useExperiments } from '../app/data';
import { useAccountScope } from '../app/accountScope';
import type { Carousel } from '../domain/carousel';
import { allExperiments, variantOf } from '../domain/experiments/experiment';
import { MEASURE_AFTER_DAYS, pendingMeasurements, type PendingMeasurement } from '../domain/experiments/followUp';
import { todayIso } from '../domain/schedule';
import { Button } from '../ui/primitives';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** "Falta medir": test posts waiting for their numbers, each with the button that records them. */
export function PendingMeasurementsList({ pending, onMeasure }: { pending: PendingMeasurement[]; onMeasure: (carousel: Carousel) => void }) {
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="mb-8 rounded-2xl border border-amber-300/70 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-950/20">
      <h2 id="pending-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ClipboardList className="size-4 text-amber-600 dark:text-amber-300" aria-hidden /> Falta medir ({pending.length})
      </h2>
      <p className="mt-0.5 text-xs text-muted">Posts de teste publicados há {MEASURE_AFTER_DAYS} dias ou mais sem métricas. Sem os números, o teste não chega a um resultado.</p>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {pending.map(({ item, experiment, postedOn, daysSince }) => (
          <li key={item.record.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium text-ink">{item.record.hook || item.record.title}</p>
              <p className="text-xs text-faint">
                <Link to={`/testes/${experiment.id}`} className="underline underline-offset-2 hover:text-ink">
                  {experiment.name}
                </Link>{' '}
                · {variantOf(item)} · postado {formatDay(postedOn)}, há {daysSince} dias
              </p>
            </div>
            {item.carousel && (
              <Button size="sm" variant="primary" onClick={() => onMeasure(item.carousel as Carousel)}>
                <BarChart3 className="size-4" aria-hidden /> Adicionar métricas
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line on other screens: how many test posts are waiting for numbers, linking to Testes. */
export function PendingMeasurementsNotice() {
  const library = useWinnerLibrary();
  const experiments = useExperiments();
  const scope = useAccountScope();
  const count = useMemo(() => {
    const tests = allExperiments(experiments.data, library.carousels.data);
    return pendingMeasurements(library.items, tests, todayIso()).filter(({ item }) => scope.matches(item.record.accountId)).length;
  }, [experiments.data, library.items, library.carousels.data, scope]);
  if (library.loading || experiments.loading || count === 0) return null;
  return (
    <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <ClipboardList className="size-4 shrink-0" aria-hidden />
      {count} {count === 1 ? 'post de teste está esperando' : 'posts de teste estão esperando'} as métricas.
      <Link to="/testes" className="font-medium underline underline-offset-2">
        Medir agora
      </Link>
    </p>
  );
}
