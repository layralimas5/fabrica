import { Check, Download, FolderInput, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CAROUSEL_STATUSES, STATUS_LABELS, type CarouselStatus } from '../domain/carousel';
import { Button, Dialog, Field, Input, Select } from '../ui/primitives';

/** Winner goes through the star, which also records the content in Modelos Vencedores. */
const BULK_STATUSES = CAROUSEL_STATUSES.filter((status) => status !== 'winner');

export interface PlaceOption {
  project: string;
  folders: string[];
}

interface SelectionBarProps {
  selectedCount: number;
  visibleCount: number;
  busy: boolean;
  places: PlaceOption[];
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onMarkPosted: (posted: boolean) => void;
  onSetStatus: (status: CarouselStatus) => void;
  onMove: (project: string, folder: string) => void;
  onDownload: () => void;
  onRemove: () => void;
}

/** Actions for the carousels picked in Projetos: post, status, move, download and delete in one go. */
export function SelectionBar({ selectedCount, visibleCount, busy, places, onSelectAll, onClear, onExit, onMarkPosted, onSetStatus, onMove, onDownload, onRemove }: SelectionBarProps) {
  const [moving, setMoving] = useState(false);
  const none = selectedCount === 0;
  const allPicked = selectedCount >= visibleCount;

  return (
    <div className="sticky top-16 z-20 mb-4 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-surface/95 p-3 shadow-sm backdrop-blur lg:top-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-sm font-medium text-ink" aria-live="polite">
          {none ? 'Clique nos carrosséis pra selecionar' : `${selectedCount} ${selectedCount === 1 ? 'selecionado' : 'selecionados'}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={allPicked ? onClear : onSelectAll}>
            {allPicked ? 'Limpar seleção' : `Selecionar todos (${visibleCount})`}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onExit}>
            <X className="size-4" aria-hidden /> Sair da seleção
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" loading={busy} disabled={none} onClick={() => onMarkPosted(true)}>
          {!busy && <Check className="size-4" aria-hidden />} Marcar como postado
        </Button>
        <Button size="sm" variant="secondary" disabled={none || busy} onClick={() => onMarkPosted(false)}>
          Desmarcar postado
        </Button>
        <div className="w-40">
          <Select aria-label="Mudar o status dos selecionados" value="" disabled={none || busy} onChange={(e) => e.target.value && onSetStatus(e.target.value as CarouselStatus)} className="!h-8 py-0 text-xs">
            <option value="">Mudar status…</option>
            {BULK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="secondary" disabled={none || busy} onClick={() => setMoving(true)}>
          <FolderInput className="size-4" aria-hidden /> Mover
        </Button>
        <Button size="sm" variant="secondary" disabled={none || busy} onClick={onDownload}>
          <Download className="size-4" aria-hidden /> Baixar em ZIP
        </Button>
        <Button size="sm" variant="ghost" disabled={none || busy} onClick={onRemove} className="text-red-600 hover:text-red-700 dark:text-red-400">
          <Trash2 className="size-4" aria-hidden /> Excluir
        </Button>
      </div>
      {moving && (
        <MoveDialog
          count={selectedCount}
          places={places}
          onClose={() => setMoving(false)}
          onMove={(project, folder) => {
            setMoving(false);
            onMove(project, folder);
          }}
        />
      )}
    </div>
  );
}

function MoveDialog({ count, places, onClose, onMove }: { count: number; places: PlaceOption[]; onClose: () => void; onMove: (project: string, folder: string) => void }) {
  const [project, setProject] = useState('');
  const [folder, setFolder] = useState('');
  const folders = places.find((place) => place.project === project.trim())?.folders.filter(Boolean) ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onMove(project.trim(), folder.trim());
  };

  return (
    <Dialog
      title={`Mover ${count} ${count === 1 ? 'carrossel' : 'carrosséis'}`}
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="move-form">
            Mover
          </Button>
        </>
      }
    >
      <form id="move-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Projeto" htmlFor="move-project" hint="Escolha um da lista ou escreva um novo. Vazio = sem projeto.">
          <Input id="move-project" list="move-projects" value={project} onChange={(e) => setProject(e.target.value)} autoFocus />
          <datalist id="move-projects">
            {places
              .filter((place) => place.project)
              .map((place) => (
                <option key={place.project} value={place.project} />
              ))}
          </datalist>
        </Field>
        <Field label="Pasta" htmlFor="move-folder" hint="Vazio = sem pasta.">
          <Input id="move-folder" list="move-folders" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <datalist id="move-folders">
            {folders.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      </form>
    </Dialog>
  );
}
