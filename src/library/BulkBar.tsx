import { Tags, X } from 'lucide-react';
import { useState } from 'react';
import { parseTags } from '../domain/asset';
import type { BulkEdit } from '../application/bulkEditAssets';
import { Button, Field, Input, Select } from '../ui/primitives';

interface BulkBarProps {
  selectedCount: number;
  visibleCount: number;
  folders: string[];
  progress: string | null;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  onApply: (edit: BulkEdit) => Promise<void>;
}

const KEEP_FOLDER = '__keep__';

/** Toolbar of the selection mode: tag or move many photos at once. */
export function BulkBar({ selectedCount, visibleCount, folders, progress, onSelectAll, onClear, onDone, onApply }: BulkBarProps) {
  const [tags, setTags] = useState('');
  const [moveTo, setMoveTo] = useState(KEEP_FOLDER);
  const addTags = parseTags(tags);
  const canApply = selectedCount > 0 && (addTags.length > 0 || moveTo !== KEEP_FOLDER) && progress === null;

  const apply = async () => {
    await onApply({ addTags, moveTo: moveTo === KEEP_FOLDER ? null : moveTo });
    setTags('');
    setMoveTo(KEEP_FOLDER);
  };

  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink" aria-live="polite">
          {selectedCount} {selectedCount === 1 ? 'foto selecionada' : 'fotos selecionadas'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onSelectAll} disabled={progress !== null}>
            Selecionar todas ({visibleCount})
          </Button>
          {selectedCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onClear} disabled={progress !== null}>
              Limpar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDone} disabled={progress !== null}>
            <X className="size-4" aria-hidden /> Sair da seleção
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
        <Field label="Adicionar tags" htmlFor="bulk-tags" hint="Separadas por vírgula. As tags que cada foto já tem continuam.">
          <Input id="bulk-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="café, manhã, rotina" />
        </Field>
        <Field label="Mover pra pasta" htmlFor="bulk-folder">
          <Select id="bulk-folder" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value={KEEP_FOLDER}>Manter onde estão</option>
            {folders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" disabled={!canApply} loading={progress !== null} onClick={() => void apply()}>
          {progress === null && <Tags className="size-4" aria-hidden />}
          {progress ?? `Aplicar em ${selectedCount}`}
        </Button>
      </div>
    </div>
  );
}
