import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { niceTicks, shortDay } from './scale';
import { useWidth } from './useWidth';

export interface LinePoint {
  day: string;
  value: number | null;
  /** Small count drawn in the strip under the line (e.g. posts published that day). */
  marker?: number;
}

interface LineChartProps {
  points: LinePoint[];
  /** Names the series in the tooltip and for screen readers. */
  label: string;
  markerLabel?: string;
  format: (value: number) => string;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
const STRIP = 22;

/**
 * One series over days, with a crosshair tooltip on hover and arrow keys. Days without a reading break the
 * line instead of being drawn as zero. A strip below counts the markers (posts per day) on its own scale.
 */
export function LineChart({ points, label, markerLabel, format, height = 220 }: LineChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const hasStrip = markerLabel !== undefined;
  const plotBottom = height - PAD.bottom - (hasStrip ? STRIP + 6 : 0);
  const innerWidth = Math.max(1, width - PAD.left - PAD.right);
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1] || 1;
  const x = (index: number) => PAD.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => PAD.top + (1 - value / top) * (plotBottom - PAD.top);
  const maxMarker = Math.max(1, ...points.map((point) => point.marker ?? 0));

  // Segments between gaps: a missing reading is not a zero.
  const segments: string[] = [];
  let current = '';
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`;
  });
  if (current) segments.push(current);

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((index) => Math.min(points.length - 1, Math.max(0, (index ?? points.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
  };

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 70))));
  const activePoint = active !== null ? points[active] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        style={{ width: '100%' }}
        role="img"
        aria-label={`${label} por dia. Use as setas para ler cada dia.`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="block overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px] tabular-nums">
              {format(tick)}
            </text>
          </g>
        ))}
        {segments.map((path) => (
          <path key={path} d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* A lone reading between gaps would be invisible as a line. */}
        {points.map((point, index) =>
          point.value !== null && (points[index - 1]?.value ?? null) === null && (points[index + 1]?.value ?? null) === null ? (
            <circle key={point.day} cx={x(index)} cy={y(point.value)} r={3} fill="var(--series-1)" />
          ) : null,
        )}

        {hasStrip &&
          points.map((point, index) =>
            point.marker ? (
              <rect
                key={`m-${point.day}`}
                x={x(index) - 3}
                y={plotBottom + 6 + STRIP - (point.marker / maxMarker) * STRIP}
                width={6}
                height={(point.marker / maxMarker) * STRIP}
                rx={2}
                fill="var(--faint)"
              />
            ) : null,
          )}

        {points.map((point, index) =>
          (index % labelEvery === 0 && points.length - 1 - index >= labelEvery / 2) || index === points.length - 1 ? (
            <text key={`d-${point.day}`} x={x(index)} y={height - 8} textAnchor="middle" className="fill-faint text-[11px] tabular-nums">
              {shortDay(point.day)}
            </text>
          ) : null,
        )}

        {activePoint && active !== null && (
          <g aria-hidden>
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={plotBottom} stroke="var(--chart-axis)" strokeWidth={1} />
            {activePoint.value !== null && <circle cx={x(active)} cy={y(activePoint.value)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
        <rect x={PAD.left} y={0} width={innerWidth} height={height} fill="transparent" onPointerMove={pick} onPointerLeave={() => setActive(null)} />
      </svg>

      {activePoint && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(active), 80), width - 80) }}
        >
          <p className="font-medium text-ink">{new Date(`${activePoint.day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted">
            <span className="inline-block size-2 rounded-full" style={{ background: 'var(--series-1)' }} aria-hidden />
            {label}: <span className="font-medium tabular-nums text-ink">{activePoint.value === null ? 'sem leitura' : format(activePoint.value)}</span>
          </p>
          {hasStrip && (
            <p className="mt-0.5 text-muted">
              {markerLabel}: <span className="font-medium tabular-nums text-ink">{activePoint.marker ?? 0}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
