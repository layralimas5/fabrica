import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { Input } from './primitives';

export interface NameOption {
  name: string;
  count?: number;
}

interface NamePickerProps {
  label: string;
  /** Names that already exist; shown as chips to pick from. */
  options: NameOption[];
  value: string;
  onChange: (name: string) => void;
  createLabel: string;
  placeholder: string;
  /** Extra chip that means "none", with value ''. */
  noneLabel?: string;
  hint?: string;
  disabled?: boolean;
  maxLength?: number;
}

/** Pick an existing project or folder, or type a new one. With nothing created yet, it opens on the text field. */
export function NamePicker({ label, options, value, onChange, createLabel, placeholder, noneLabel, hint, disabled = false, maxLength = 60 }: NamePickerProps) {
  const isExisting = options.some((option) => option.name === value) || (noneLabel !== undefined && value === '');
  const [wantsNew, setWantsNew] = useState(false);
  // Derived, so the chips show up as soon as the existing names finish loading.
  const creating = wantsNew || (options.length === 0 && !noneLabel) || (value !== '' && !isExisting);
  const setCreating = setWantsNew;
  const inputId = `${label.replace(/\s+/g, '-').toLowerCase()}-new`;

  const pick = (name: string) => {
    setCreating(false);
    onChange(name);
  };

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      {(options.length > 0 || noneLabel) && (
        <div className="flex flex-wrap gap-2">
          {noneLabel && <Chip active={!creating && value === ''} onClick={() => pick('')} label={noneLabel} />}
          {options.map((option) => (
            <Chip key={option.name} active={!creating && value === option.name} onClick={() => pick(option.name)} label={option.name} count={option.count} />
          ))}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              onChange('');
            }}
            aria-pressed={creating}
            className={clsx(
              'inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              creating ? 'border-accent text-ink' : 'border-line text-muted hover:border-faint hover:text-ink',
            )}
          >
            <Plus className="size-3.5" aria-hidden /> {createLabel}
          </button>
        </div>
      )}
      {creating && (
        <>
          <label htmlFor={inputId} className="sr-only">
            {createLabel}
          </label>
          <Input id={inputId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoFocus={options.length > 0} />
        </>
      )}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </fieldset>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
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
      {count !== undefined && <span className="text-xs text-faint">{count}</span>}
    </button>
  );
}
