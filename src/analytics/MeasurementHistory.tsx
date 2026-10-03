import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MOMENTUM_INFO, type MeasurementStep, type Momentum } from '../domain/analytics/growth';
import { formatMetric, type PerformanceKey } from '../domain/winners/record';
import { Badge } from '../ui/primitives';
import { formatDayBr } from '../winners/WinnerCard';

const COLUMNS: { key: PerformanceKey; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'saves', label: 'Salvos' },
  { key: 'shares', label: 'Compart.' },
  { key: 'follows', label: 'Seguidores' },
];

const MOMENTUM_TONE: Record<Momentum, 'success' | 'warning' | 'neutral' | 'accent'> = { growing: 'success', slowing: 'warning', stable: 'neutral', early: 'accent' };

export function MomentumBadge({ momentum }: { momentum: Momentum | null }) {
  if (!momentum) return null;
  return (
    <span title={MOMENTUM_INFO[momentum].detail}>
      <Badge tone={MOMENTUM_TONE[momentum]}>{MOMENTUM_INFO[momentum].label}</Badge>
    </span>
  );
}

const ageLabel = (age: number | null) => (age === null ? '' : age <= 0 ? 'dia da postagem' : `${age}º dia`);

/** One row per measurement, with what grew since the one before. */
export function MeasurementTable({ steps, onRemove }: { steps: MeasurementStep[]; onRemove?: (day: string) => void }) {
  const visible = COLUMNS.filter((column) => steps.some((step) => step.metrics[column.key] !== null));
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="bg-subtle text-faint">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Medição</th>
            {visible.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2 text-right font-medium">{column.label}</th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-medium">Views/dia</th>
            {onRemove && <th scope="col" className="w-8 px-1 py-2"><span className="sr-only">Apagar</span></th>}
          </tr>
        </thead>
        <tbody>
          {[...steps].reverse().map((step) => (
            <tr key={step.day} className="border-t border-line">
              <th scope="row" className="px-3 py-2 font-medium text-ink">
                {formatDayBr(step.day)}
                {step.ageDays !== null && <span className="block text-[11px] font-normal text-faint">{ageLabel(step.ageDays)}</span>}
              </th>
              {visible.map((column) => {
                const value = step.metrics[column.key];
                const delta = step.delta[column.key];
                return (
                  <td key={column.key} className="px-3 py-2 text-right tabular-nums text-ink">
                    {value === null ? <span className="text-faint">—</span> : formatMetric(column.key, value)}
                    {delta !== null && delta !== 0 && (
                      <span className={clsx('block text-[11px]', delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400')}>
                        {delta > 0 ? '+' : ''}
                        {formatMetric(column.key, delta)}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums text-muted">{step.viewsPerDay === null ? '—' : Math.round(step.viewsPerDay).toLocaleString('pt-BR')}</td>
              {onRemove && (
                <td className="px-1 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(step.day)}
                    aria-label={`Apagar a medição de ${formatDayBr(step.day)}`}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-faint hover:bg-subtle hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WIDTH = 560;
const HEIGHT = 140;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

/** Views over the post's life. The posting day sits at zero; the table above is the accessible view of the same numbers. */
export function ViewsChart({ steps, publishedAt }: { steps: MeasurementStep[]; publishedAt: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const measured = steps.filter((step) => step.metrics.views !== null);
  if (measured.length === 0) return null;
  const points = [
    ...(publishedAt && measured[0].day > publishedAt ? [{ day: publishedAt, views: 0, label: 'Postagem' }] : []),
    ...measured.map((step) => ({ day: step.day, views: step.metrics.views ?? 0, label: ageLabel(step.ageDays) || formatDayBr(step.day) })),
  ];
  const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const [start, end] = [time(points[0].day), time(points[points.length - 1].day)];
  const max = Math.max(...points.map((point) => point.views), 1);
  const x = (day: string) => PAD.left + (end === start ? 0.5 : (time(day) - start) / (end - start)) * (WIDTH - PAD.left - PAD.right);
  const y = (views: number) => HEIGHT - PAD.bottom - (views / max) * (HEIGHT - PAD.top - PAD.bottom);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.day).toFixed(1)},${y(point.views).toFixed(1)}`).join(' ');
  const active = hover === null ? null : points[hover];

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full text-accent" role="img" aria-label={`Visualizações ao longo do tempo, de 0 a ${max.toLocaleString('pt-BR')}`} onMouseLeave={() => setHover(null)}>
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={HEIGHT - PAD.bottom} y2={HEIGHT - PAD.bottom} className="stroke-line" strokeWidth={1} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.day}>
            <circle cx={x(point.day)} cy={y(point.views)} r={hover === index ? 5 : 4} fill="currentColor" className="stroke-surface" strokeWidth={2} />
            <rect x={x(point.day) - 14} y={0} width={28} height={HEIGHT} fill="transparent" onMouseEnter={() => setHover(index)} />
          </g>
        ))}
        <text x={PAD.left} y={HEIGHT - 6} className="fill-faint text-[10px]">{formatDayBr(points[0].day)}</text>
        {points.length > 1 && (
          <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-faint text-[10px]">{formatDayBr(points[points.length - 1].day)}</text>
        )}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-sm"
          style={{ left: `${(x(active.day) / WIDTH) * 100}%`, top: `${(y(active.views) / HEIGHT) * 100}%` }}
        >
          <p className="font-semibold tabular-nums text-ink">{active.views.toLocaleString('pt-BR')} views</p>
          <p className="text-faint">{active.label} · {formatDayBr(active.day)}</p>
        </div>
      )}
    </figure>
  );
}
