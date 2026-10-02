import { Bookmark, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../app/useResource';
import { MAX_PRESET_NAME, type Preset } from '../domain/preset';
import { Alert, Button, Dialog, Field, Input, Select } from '../ui/primitives';

interface PresetBarProps {
  presets: Preset[];
  selectedId: string | null;
  onSelect: (preset: Preset | null) => void;
  /** Saves the current screen; with an id it overwrites that preset. */
  onSave: (name: string, overwriteId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  disabled?: boolean;
}

/** Saved create-screen setups: pick one to fill every step, or save the current one for the next batch. */
export function PresetBar({ presets, selectedId, onSelect, onSave, onDelete, disabled = false }: PresetBarProps) {
  const [saving, setSaving] = useState(false);
  const selected = presets.find((preset) => preset.id === selectedId) ?? null;

  const remove = async () => {
    if (!selected || !window.confirm(`Excluir a predefinição "${selected.name}"? Os carrosséis já criados não mudam.`)) return;
    await onDelete(selected.id);
  };

  return (
    <div className="flex flex-col gap-3 border-b border-line bg-subtle/60 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex min-w-0 flex-1 items-end gap-2">
        <Field label="Predefinição" htmlFor="preset" className="min-w-0 flex-1 sm:max-w-sm">
          <Select
            id="preset"
            value={selected?.id ?? ''}
            onChange={(e) => onSelect(presets.find((preset) => preset.id === e.target.value) ?? null)}
            disabled={disabled || presets.length === 0}
          >
            <option value="">{presets.length === 0 ? 'Nenhuma salva ainda' : 'Sem predefinição'}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </Select>
        </Field>
        {selected && (
          <Button variant="ghost" size="md" aria-label={`Excluir a predefinição ${selected.name}`} onClick={() => void remove()} disabled={disabled}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden text-xs text-faint lg:block">Guarda rede, conta, marca, modelo, sombreamento, pastas e programação.</p>
        <Button variant="secondary" onClick={() => setSaving(true)} disabled={disabled}>
          <Save className="size-4" aria-hidden /> Salvar predefinição
        </Button>
      </div>
      {saving && <SaveDialog selected={selected} onClose={() => setSaving(false)} onSave={onSave} />}
    </div>
  );
}

function SaveDialog({ selected, onClose, onSave }: { selected: Preset | null; onClose: () => void; onSave: PresetBarProps['onSave'] }) {
  const [name, setName] = useState(selected?.name ?? '');
  const [pending, setPending] = useState<'update' | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (overwriteId: string | null) => {
    setPending(overwriteId ? 'update' : 'new');
    setError(null);
    try {
      await onSave(name.trim(), overwriteId);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(null);
    }
  };

  const renamed = selected !== null && name.trim() !== selected.name;

  return (
    <Dialog
      title="Salvar predefinição"
      open
      onClose={onClose}
      footer={
        <>
          {selected && (
            <Button variant="secondary" loading={pending === 'update'} disabled={!name.trim() || pending !== null} onClick={() => void save(selected.id)}>
              Atualizar "{renamed ? name.trim() || selected.name : selected.name}"
            </Button>
          )}
          <Button variant="primary" loading={pending === 'new'} disabled={!name.trim() || pending !== null} onClick={() => void save(null)}>
            <Bookmark className="size-4" aria-hidden /> Salvar como nova
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Tudo o que está escolhido na tela fica salvo, menos o texto das copys. Da próxima vez, escolha a predefinição e só cole as copys.
        </p>
        <Field label="Nome" htmlFor="preset-name">
          <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_PRESET_NAME} placeholder="Ex: Ella · TikTok · 2 por dia" autoFocus />
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}
