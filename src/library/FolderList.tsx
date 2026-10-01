import clsx from 'clsx';
import { Check, Pencil, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_FOLDER_LENGTH, normalizeFolder } from '../domain/asset';

interface FolderListProps {
  counts: Map<string, number>;
  total: number;
  selected: string;
  onSelect: (folder: string) => void;
  onRename: (from: string, to: string) => Promise<void>;
}

/** Library sidebar: pick a folder to filter, or rename it inline. */
export function FolderList({ counts, total, selected, onSelect, onRename }: FolderListProps) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <nav aria-label="Pastas" className="flex gap-1 overflow-x-auto md:flex-col">
      <FolderButton label="Todas" count={total} active={selected === ''} onClick={() => onSelect('')} />
      {[...counts.entries()].map(([folder, count]) =>
        editing === folder ? (
          <RenameForm
            key={folder}
            folder={folder}
            existing={[...counts.keys()]}
            onCancel={() => setEditing(null)}
            onSave={async (name) => {
              await onRename(folder, name);
              setEditing(null);
            }}
          />
        ) : (
          <div key={folder} className="group relative flex shrink-0 items-center">
            <FolderButton label={folder} count={count} active={selected === folder} onClick={() => onSelect(folder)} className="pr-10" />
            <button
              type="button"
              onClick={() => setEditing(folder)}
              aria-label={`Renomear pasta ${folder}`}
              className="absolute right-1.5 grid size-7 place-items-center rounded-lg text-faint transition-opacity hover:bg-subtle hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:opacity-0 md:group-hover:opacity-100"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
        ),
      )}
    </nav>
  );
}

interface FolderButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  className?: string;
}

function FolderButton({ label, count, active, onClick, className }: FolderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={clsx(
        'flex h-10 w-full shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-subtle hover:text-ink',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-faint">{count}</span>
    </button>
  );
}

interface RenameFormProps {
  folder: string;
  existing: string[];
  onCancel: () => void;
  onSave: (name: string) => Promise<void>;
}

function RenameForm({ folder, existing, onCancel, onSave }: RenameFormProps) {
  const [value, setValue] = useState(folder);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = normalizeFolder(value);
    if (!name) return setError('Dá um nome pra pasta.');
    if (name === folder) return onCancel();
    if (existing.includes(name) && !window.confirm(`Já existe a pasta "${name}". Juntar as fotos de "${folder}" nela?`)) return;

    setPending(true);
    setError(null);
    try {
      await onSave(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex shrink-0 flex-col gap-1">
      <div className="flex items-center gap-1 rounded-xl bg-surface p-1 ring-2 ring-accent">
        <label htmlFor={`rename-${folder}`} className="sr-only">
          Novo nome da pasta {folder}
        </label>
        <input
          id={`rename-${folder}`}
          autoFocus
          value={value}
          maxLength={MAX_FOLDER_LENGTH}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm text-ink outline-none"
        />
        <button type="submit" disabled={pending} aria-label="Salvar nome" className="grid size-8 place-items-center rounded-lg text-accent hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Check className="size-4" aria-hidden />
        </button>
        <button type="button" disabled={pending} onClick={onCancel} aria-label="Cancelar" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {error && (
        <p role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
