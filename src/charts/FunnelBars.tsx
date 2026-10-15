import clsx from 'clsx';
import { TrendingDown } from 'lucide-react';

export interface FunnelBar {
  key: string;
  label: string;
  value: number | null;
  /** Share of the previous measured step that reached this one. */
  fromPrevious: number | null;
  /** Shown instead of the bar when the step is not measured. */
  missing?: string;
}

/**
 * Funnel as horizontal bars on one scale (the first step), each with its count and the share that came
 * from the step before. The step with the biggest loss is marked with an icon and text, not color alone.
 */
export function FunnelBars({ steps, worstKey, format }: { steps: FunnelBar[]; worstKey: string | null; format: (value: number) => string }) {
  const max = Math.max(0, ...steps.map((step) => step.value ?? 0));
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step) => {
        const worst = step.key === worstKey;
        return (
          <li key={step.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <span className={clsx('truncate text-sm', worst ? 'font-medium text-ink' : 'text-muted')} title={step.label}>
              {step.label}
            </span>
            {step.value === null ? (
              <span className="text-xs text-faint">{step.missing ?? 'não medido'}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-6 min-w-0 flex-1 rounded-md bg-subtle">
                  <span className="block h-full rounded-md" style={{ width: `${max > 0 ? Math.max(1.5, (step.value / max) * 100) : 0}%`, background: 'var(--series-1)' }} />
                </span>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-ink sm:w-36">
                  {format(step.value)}
                  {step.fromPrevious !== null && (
                    <span className={clsx('ml-1', worst ? 'font-medium text-red-700 dark:text-red-400' : 'text-faint')}>
                      {worst && <TrendingDown className="mr-0.5 inline size-3" aria-hidden />}
                      {(step.fromPrevious * 100).toLocaleString('pt-BR', { maximumFractionDigits: step.fromPrevious < 0.01 ? 2 : 1 })}%
                    </span>
                  )}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
