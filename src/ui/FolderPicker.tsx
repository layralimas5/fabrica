import clsx from 'clsx';
import { Check } from 'lucide-react';

interface FolderPickerProps {
  label: string;
  counts: Map<string, number>;
  /** Empty means every folder. */
  selected: string[];
  onChange: (folders: string[]) => void;
  disabled?: boolean;
}

/** Multi-select of library folders as toggle chips, with an "all folders" shortcut. */
export function FolderPicker({ label, counts, selected, onChange, disabled }: FolderPickerProps) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  // Keeps exactly what was clicked; only the "Todas" chip goes back to every folder.
  const toggle = (folder: string) => {
    onChange(selected.includes(folder) ? selected.filter((item) => item !== folder) : [...selected, folder]);
  };

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Chip active={selected.length === 0} onClick={() => onChange([])} label="Todas" count={total} />
        {[...counts.entries()].map(([folder, count]) => (
          <Chip key={folder} active={selected.includes(folder)} onClick={() => toggle(folder)} label={folder} count={count} />
        ))}
      </div>
    </fieldset>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
        active ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-faint hover:text-ink',
      )}
    >
      {active && <Check className="size-3.5 text-accent" aria-hidden />}
      {label}
      <span className="text-xs text-faint">{count}</span>
    </button>
  );
}
