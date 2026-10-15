export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  /** Text after the value, e.g. "3 posts · 4,2% eng.". */
  detail?: string;
}

/**
 * Horizontal bars for comparing a few groups on one measure. Every bar carries its value as text, so the
 * comparison never depends on color or on reading the length alone. A null value is said, not drawn as zero.
 */
export function BarList({ rows, format, emptyLabel = 'indisponível' }: { rows: BarRow[]; format: (value: number) => string; emptyLabel?: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value ?? 0));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
          <span className="truncate text-muted" title={row.label}>
            {row.label}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 min-w-0 flex-1 rounded-full bg-subtle">
              {row.value !== null && max > 0 && (
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: 'var(--series-1)' }} />
              )}
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums text-ink">
              {row.value === null ? <span className="text-faint">{emptyLabel}</span> : format(row.value)}
              {row.detail && <span className="text-faint"> · {row.detail}</span>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
