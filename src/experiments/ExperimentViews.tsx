import clsx from 'clsx';
import { FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CONFIDENCE_LABELS,
  COVERAGE_INFO,
  EXPERIMENT_STATUS_LABELS,
  learnings,
  TEST_VARIABLE_LABELS,
  testMap,
  type Experiment,
  type ExperimentResult,
  type ExperimentStatus,
} from '../domain/experiments/experiment';
import type { AnalyticsItem } from '../domain/analytics/items';
import { isScheduled } from '../domain/carousel';
import { TEST_METRIC_LABELS, variablesOf } from '../domain/experiments/experiment';
import { Badge } from '../ui/primitives';

export const EXPERIMENT_STATUS_TONES: Record<ExperimentStatus, 'neutral' | 'accent' | 'success' | 'warning'> = {
  planejado: 'neutral',
  em_andamento: 'accent',
  dados_insuficientes: 'warning',
  concluido: 'success',
};

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const formatWeekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** When a test member goes out: posted day, or the planned day and time. */
export function postingLabel(item: AnalyticsItem): string {
  const carousel = item.carousel;
  const time = carousel?.source.scheduledTime ?? null;
  if (carousel?.scheduledFor && isScheduled(carousel)) return `Programado ${formatWeekday(carousel.scheduledFor)}${time ? ` às ${time}` : ''}`;
  if (item.record.publishedAt) return `Postado ${formatWeekday(item.record.publishedAt)}${time ? ` · ${time}` : ''}`;
  return time ? `Sem data · ${time}` : 'Sem data';
}

export function ExperimentCard({ experiment, result, accountName }: { experiment: Experiment; result: ExperimentResult; accountName: string }) {
  return (
    <Link to={`/testes/${experiment.id}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={EXPERIMENT_STATUS_TONES[result.status]}>{EXPERIMENT_STATUS_LABELS[result.status]}</Badge>
        {variablesOf(experiment).map((variable) => (
          <Badge key={variable}>{TEST_VARIABLE_LABELS[variable]}</Badge>
        ))}
      </div>
      <p className="text-sm font-semibold text-ink">{experiment.name}</p>
      {experiment.hypothesis && <p className="line-clamp-2 text-sm text-muted">{experiment.hypothesis}</p>}
      <p className="text-xs text-muted">
        Decide: {TEST_METRIC_LABELS[experiment.goalMetric]}
        {experiment.times.length > 0 && ` · ${experiment.times.join(' · ')}`}
      </p>
      <p className="mt-auto text-xs text-faint">
        {accountName} · {result.members} {result.members === 1 ? 'conteúdo' : 'conteúdos'}
        {result.period ? ` · ${formatDay(result.period.from)} a ${formatDay(result.period.to)}` : ''}
      </p>
      {result.leader && (
        <p className="text-xs text-ink">
          Maior resultado: <span className="font-semibold">{result.leader.label}</span> · <span className="text-muted">{result.confidence ? CONFIDENCE_LABELS[result.confidence] : ''}</span>
        </p>
      )}
    </Link>
  );
}

/** Which elements were tested: ✅ a lot, ⚠️ a little, ❌ never. */
export function TestMap({ experiments }: { experiments: Experiment[] }) {
  return (
    <section aria-labelledby="test-map-title" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="test-map-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <FlaskConical className="size-4 text-accent" aria-hidden /> Mapa de testes
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {testMap(experiments).map((row) => (
          <li key={row.variable} className="text-sm">
            <span className="text-ink">{TEST_VARIABLE_LABELS[row.variable]}</span>
            <span className={clsx('block text-xs', row.level === 'bastante' ? 'text-emerald-700 dark:text-emerald-300' : row.level === 'pouco' ? 'text-amber-700 dark:text-amber-300' : 'text-faint')}>
              {COVERAGE_INFO[row.level].emoji} {COVERAGE_INFO[row.level].label}
              {row.count > 0 ? ` (${row.count})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Learnings({ experiments, accountName }: { experiments: Experiment[]; accountName: (accountId: string | null) => string }) {
  const list = learnings(experiments);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="learnings-title" className="mt-8">
      <h2 id="learnings-title" className="mb-3 text-sm font-semibold text-ink">
        Aprendizados
      </h2>
      <ul className="flex flex-col gap-2">
        {list.map((experiment) => (
          <li key={experiment.id} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-sm text-ink">{experiment.learning}</p>
            <p className="mt-1 text-xs text-faint">
              {accountName(experiment.accountId)} ·{' '}
              <Link to={`/testes/${experiment.id}`} className="underline underline-offset-2">
                {experiment.name}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
