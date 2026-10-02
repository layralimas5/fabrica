import { ArrowRight, CheckCircle2, FolderOpen } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { ImageFormat } from '../app/exportCarousel';
import { ensureWriteAccess, folderSavingSupported, pickBaseFolder, safeFolderName, saveToFolder, savedBaseFolder } from '../app/folderSaving';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { Alert, Button, Dialog, Field, Input } from '../ui/primitives';
import { Chip } from '../winners/chips';

const NAMES_KEY = 'fabrica:folder-names';
const BY_PROJECT_KEY = 'fabrica:folder-by-project';
const FORMAT_KEY = 'fabrica:folder-format';

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering names and choices is a convenience; saving works without it.
  }
}

interface SaveToFolderDialogProps {
  open: boolean;
  onClose: () => void;
  context: RenderContext;
  carousel: Carousel;
  /** Next carousel of the same batch still to review, if any. */
  next: Carousel | null;
  onSaved: () => void;
  onNext: (carousel: Carousel) => void;
}

/** "OK" on a reviewed carousel: its slides go as loose files into a folder of the computer, no ZIP. */
export function SaveToFolderDialog({ open, onClose, context, carousel, next, onSaved, onNext }: SaveToFolderDialogProps) {
  const supported = folderSavingSupported();
  const [base, setBase] = useState<FileSystemDirectoryHandle | null>(null);
  const [name, setName] = useState('');
  const [byProject, setByProject] = useState(() => readJson(BY_PROJECT_KEY, true));
  const [format, setFormat] = useState<ImageFormat>(() => (readJson<string>(FORMAT_KEY, 'jpg') === 'png' ? 'png' : 'jpg'));
  const [progress, setProgress] = useState<number | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(readJson<Record<string, string>>(NAMES_KEY, {})[carousel.id] ?? safeFolderName(carousel.title));
    setSavedPath(null);
    setError(null);
    void savedBaseFolder().then(setBase);
  }, [open, carousel.id, carousel.title]);

  const subfolders = byProject ? [carousel.project, carousel.folder].map(safeFolderName).filter(Boolean) : [];
  const folderName = safeFolderName(name);
  const path = [base?.name ?? 'pasta escolhida', ...subfolders, folderName || '…'];

  const chooseBase = async () => {
    setError(null);
    try {
      const picked = await pickBaseFolder();
      if (picked) setBase(picked);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderName) return setError('Dá um nome pra pasta do carrossel.');
    setError(null);
    try {
      const target = base ?? (await pickBaseFolder());
      if (!target) return;
      setBase(target);
      if (!(await ensureWriteAccess(target))) return setError('O navegador não liberou a gravação nessa pasta. Clica em salvar de novo e permite o acesso.');
      setProgress(0);
      const { carouselFiles } = await import('../app/exportCarousel');
      const files = await carouselFiles(context, carousel, format, setProgress);
      await saveToFolder(target, [...subfolders, folderName], files);
      writeJson(NAMES_KEY, { ...readJson<Record<string, string>>(NAMES_KEY, {}), [carousel.id]: folderName });
      writeJson(BY_PROJECT_KEY, byProject);
      writeJson(FORMAT_KEY, format);
      setSavedPath([target.name, ...subfolders, folderName].join(' / '));
      onSaved();
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === 'NotFoundError' ? 'A pasta escolhida não existe mais. Escolhe outra.' : errorMessage(cause));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const formId = 'save-folder-form';

  return (
    <Dialog
      title="Salvar na pasta"
      open={open}
      onClose={onClose}
      footer={
        savedPath ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {next && (
              <Button variant="primary" onClick={() => onNext(next)}>
                Revisar o próximo <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </>
        ) : (
          supported && (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" form={formId} loading={busy}>
                {busy ? `Salvando ${progress}/${carousel.slides.length}` : base ? 'OK, salvar' : 'Escolher pasta e salvar'}
              </Button>
            </>
          )
        )
      }
    >
      {!supported ? (
        <Alert tone="info">Esse navegador não deixa salvar direto numa pasta. Abre a Fábrica no Chrome ou no Edge do computador, ou usa Exportar › JPG em ZIP.</Alert>
      ) : savedPath ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">Salvo</p>
            <p className="mt-1 break-all text-sm text-muted">{savedPath}</p>
          </div>
          <p className="text-xs text-faint">
            {carousel.slides.length} {format.toUpperCase()}
            {carousel.caption.trim() ? ' + legenda.txt' : ''}
            {next ? ` · próximo do lote: ${next.title}` : ' · esse era o último do lote'}
          </p>
        </div>
      ) : (
        <form id={formId} onSubmit={save} className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <p className="text-[11px] text-faint">Pasta de destino</p>
                <p className="truncate text-sm font-medium text-ink">{base ? base.name : 'Nenhuma escolhida ainda'}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void chooseBase()} disabled={busy}>
              {base ? 'Trocar' : 'Escolher'}
            </Button>
          </div>

          <Field label="Nome da pasta do carrossel" htmlFor="folder-name">
            <Input id="folder-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </Field>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={format === 'jpg'} onClick={() => setFormat('jpg')} disabled={busy}>
              JPG
            </Chip>
            <Chip active={format === 'png'} onClick={() => setFormat('png')} disabled={busy}>
              PNG
            </Chip>
            {(carousel.project || carousel.folder) && (
              <Chip active={byProject} onClick={() => setByProject(!byProject)} disabled={busy}>
                Separar por projeto
              </Chip>
            )}
          </div>

          <p className="break-all rounded-xl bg-subtle px-3.5 py-2.5 text-xs text-muted">
            Vai ficar em: <span className="font-medium text-ink">{path.join(' / ')}</span>
          </p>
          {error && <Alert>{error}</Alert>}
        </form>
      )}
    </Dialog>
  );
}
