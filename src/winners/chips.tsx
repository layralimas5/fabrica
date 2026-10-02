import clsx from 'clsx';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}

/** Toggle chip: the whole filter and form vocabulary of the winners module. */
export function Chip({ active, onClick, children, disabled = false }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:opacity-50',
        active ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

interface ChipGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  labelOf: (option: T) => ReactNode;
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** Single choice: clicking the active chip clears it. */
  single?: boolean;
}

export function ChipGroup<T extends string>({ label, options, labelOf, selected, onChange, single = false }: ChipGroupProps<T>) {
  const toggle = (option: T) => {
    const active = selected.includes(option);
    if (single) onChange(active ? [] : [option]);
    else onChange(active ? selected.filter((item) => item !== option) : [...selected, option]);
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Chip key={option} active={selected.includes(option)} onClick={() => toggle(option)}>
            {labelOf(option)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** Read-only tag shown on cards. */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'strong' | 'accent' }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-subtle text-muted',
        tone === 'strong' && 'bg-ink/[0.06] text-ink dark:bg-white/10',
        tone === 'accent' && 'bg-accent/12 text-accent',
      )}
    >
      {children}
    </span>
  );
}

/** Active filter shown above the results, removable in one click. */
export function RemovableChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-subtle pl-2.5 pr-1 text-xs text-ink">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${typeof children === 'string' ? children : ''}`.trim()}
        className="grid size-5 place-items-center rounded-full text-muted hover:bg-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}
