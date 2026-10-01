import clsx from 'clsx';
import { Search, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { forgetAsset } from '../app/imageCache';
import { useAssets } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { ASSET_KINDS, parseTags, UNSORTED_FOLDER, type Asset, type AssetKind } from '../domain/asset';
import { AssetThumb } from '../ui/AssetThumb';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../ui/primitives';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export function LibraryPage() {
  const services = useServices();
  const assets = useAssets();
  const fileInput = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<string>('');
  const [query, setQuery] = useState('');
  const [uploadFolder, setUploadFolder] = useState(UNSORTED_FOLDER);
  const [uploadKind, setUploadKind] = useState<AssetKind>('foto');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folders = useMemo(() => [...new Set(assets.data.map((asset) => asset.folder))].sort((a, b) => a.localeCompare(b)), [assets.data]);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assets.data.filter(
      (asset) => (!folder || asset.folder === folder) && (!search || `${asset.name} ${asset.tags.join(' ')}`.toLowerCase().includes(search)),
    );
  }, [assets.data, folder, query]);

  const upload = async (files: File[]) => {
    const valid = files.filter((file) => ACCEPTED.includes(file.type) && file.size <= MAX_FILE_SIZE);
    const skipped = files.length - valid.length;
    setError(skipped > 0 ? `${skipped} arquivo(s) ignorado(s): só imagens JPG, PNG, WEBP, AVIF ou GIF até 15 MB.` : null);
    if (valid.length === 0) return;

    setUploading({ done: 0, total: valid.length });
    const tags = parseTags(uploadTags);
    for (const [index, file] of valid.entries()) {
      try {
        const asset = await services.assets.upload({ file, folder: uploadFolder.trim() || UNSORTED_FOLDER, kind: uploadKind, tags });
        assets.setData((current) => [asset, ...current]);
      } catch (cause) {
        setError(errorMessage(cause));
      }
      setUploading({ done: index + 1, total: valid.length });
    }
    setUploading(null);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    void upload(Array.from(event.dataTransfer.files));
  };

  if (assets.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Biblioteca" description="Suas fotos, mockups e fundos. As tags dizem pra IA qual imagem combina com cada slide." />

      <section
        aria-label="Enviar imagens"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={clsx('mb-8 rounded-2xl border border-dashed p-5 transition-colors', dragOver ? 'border-accent bg-accent/5' : 'border-line bg-surface')}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
          <Field label="Pasta" htmlFor="upload-folder">
            <Input id="upload-folder" list="folder-options" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} />
            <datalist id="folder-options">
              {folders.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Tags para este envio" htmlFor="upload-tags" hint="Separe por vírgula: produtividade, foco, notebook">
            <Input id="upload-tags" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="produtividade, foco" />
          </Field>
          <Field label="Tipo" htmlFor="upload-kind">
            <Select id="upload-kind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value as AssetKind)}>
              {ASSET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" loading={uploading !== null} onClick={() => fileInput.current?.click()} className="sm:mb-[18px]">
            {!uploading && <Upload className="size-4" aria-hidden />}
            {uploading ? `Enviando ${uploading.done}/${uploading.total}` : 'Enviar imagens'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">Ou arraste as imagens pra cá.</p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          className="hidden"
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </section>

      {(error ?? assets.error) && <div className="mb-4"><Alert>{error ?? assets.error}</Alert></div>}

      <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Pastas" className="flex gap-1 overflow-x-auto md:flex-col">
          {['', ...folders].map((name) => (
            <button
              key={name || 'all'}
              type="button"
              onClick={() => setFolder(name)}
              aria-current={folder === name}
              className={clsx(
                'flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                folder === name ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              {name || 'Todas'}
              <span className="text-xs text-faint">{name ? assets.data.filter((asset) => asset.folder === name).length : assets.data.length}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input aria-label="Buscar por nome ou tag" placeholder="Buscar por nome ou tag…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="Nenhuma imagem aqui" description="Envie fotos e marque com tags. Ex.: uma foto de notebook com produtividade, foco, home office." />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(asset)}
                    className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <AssetThumb asset={asset} className="aspect-square" />
                    <span className="block p-2.5">
                      <span className="block truncate text-xs font-medium text-ink">{asset.name}</span>
                      <span className="mt-1 block truncate text-[11px] text-muted">{asset.tags.length > 0 ? asset.tags.map((tag) => `#${tag}`).join(' ') : 'Sem tags'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <AssetEditor
          asset={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSaved={(saved) => assets.setData((current) => current.map((asset) => (asset.id === saved.id ? saved : asset)))}
          onRemoved={(id) => {
            forgetAsset(id);
            assets.setData((current) => current.filter((asset) => asset.id !== id));
          }}
        />
      )}
    </div>
  );
}

interface AssetEditorProps {
  asset: Asset;
  folders: string[];
  onClose: () => void;
  onSaved: (asset: Asset) => void;
  onRemoved: (id: string) => void;
}

function AssetEditor({ asset, folders, onClose, onSaved, onRemoved }: AssetEditorProps) {
  const services = useServices();
  const [name, setName] = useState(asset.name);
  const [folder, setFolder] = useState(asset.folder);
  const [kind, setKind] = useState(asset.kind);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      onSaved(await services.assets.update(asset.id, { name: name.trim() || asset.name, folder: folder.trim() || UNSORTED_FOLDER, kind, tags: parseTags(tags) }));
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Excluir ${asset.name}? Slides que usam essa imagem ficam sem ela.`)) return;
    setPending(true);
    try {
      await services.assets.remove(asset.id);
      onRemoved(asset.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  return (
    <Dialog
      title="Editar imagem"
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="danger" className="mr-auto" disabled={pending} onClick={() => void remove()}>
            Excluir
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
        <AssetThumb asset={asset} className="aspect-square rounded-xl" />
        <div className="flex flex-col gap-3">
          <Field label="Nome" htmlFor="asset-name">
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Pasta" htmlFor="asset-folder">
            <Input id="asset-folder" list="asset-folder-options" value={folder} onChange={(e) => setFolder(e.target.value)} />
            <datalist id="asset-folder-options">
              {folders.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
          <Field label="Tipo" htmlFor="asset-kind">
            <Select id="asset-kind" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {ASSET_KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" htmlFor="asset-tags" hint="Separe por vírgula. Quanto mais específicas, melhor a IA escolhe.">
            <Input id="asset-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <p className="text-xs text-faint">
            {asset.width}×{asset.height}px
          </p>
          {error && <Alert>{error}</Alert>}
        </div>
      </div>
    </Dialog>
  );
}
