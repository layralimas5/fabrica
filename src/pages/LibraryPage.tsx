import clsx from 'clsx';
import { Search, Sparkles, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { toAiImage } from '../app/aiImage';
import { forgetAsset } from '../app/imageCache';
import { tagAsset } from '../application/tagAsset';
import { useAssets } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { ACCEPTED_IMAGE_TYPES, ASSET_KINDS, isAcceptedImage, isPhotoLike, parseTags, UNSORTED_FOLDER, UPLOAD_RULES_MESSAGE, type Asset, type AssetKind } from '../domain/asset';
import { renameFolder } from '../application/renameFolder';
import { FolderList } from '../library/FolderList';
import { NamePicker } from '../ui/NamePicker';
import { AssetThumb } from '../ui/AssetThumb';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner } from '../ui/primitives';


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
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null);
  const canSeeImages = services.ai.engine === 'claude';

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets.data) counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
    return new Map([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [assets.data]);
  const folders = useMemo(() => [...folderCounts.keys()], [folderCounts]);

  const handleRename = async (from: string, to: string) => {
    await renameFolder(services, from, to);
    assets.setData((current) => current.map((asset) => (asset.folder === from ? { ...asset, folder: to } : asset)));
    if (folder === from) setFolder(to);
    if (uploadFolder === from) setUploadFolder(to);
  };
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assets.data.filter(
      (asset) => (!folder || asset.folder === folder) && (!search || `${asset.name} ${asset.tags.join(' ')}`.toLowerCase().includes(search)),
    );
  }, [assets.data, folder, query]);

  const replaceAsset = (updated: Asset) => assets.setData((current) => current.map((asset) => (asset.id === updated.id ? updated : asset)));

  /** The AI looks at the photo and adds tags for what it shows and which themes it illustrates. */
  const analyze = async (asset: Asset, blob: Blob): Promise<void> => {
    if (!canSeeImages || !isPhotoLike(asset)) return;
    replaceAsset(await tagAsset(services, asset, await toAiImage(blob)));
  };

  const analyzeLibrary = async () => {
    const targets = assets.data.filter(isPhotoLike);
    setError(null);
    setAnalyzing({ done: 0, total: targets.length });
    for (const [index, asset] of targets.entries()) {
      try {
        await analyze(asset, await services.assets.fetchBlob(asset));
      } catch (cause) {
        setError(`Não consegui analisar ${asset.name}: ${errorMessage(cause)}`);
      }
      setAnalyzing({ done: index + 1, total: targets.length });
    }
    setAnalyzing(null);
  };

  const upload = async (files: File[]) => {
    const valid = files.filter(isAcceptedImage);
    const skipped = files.length - valid.length;
    setError(skipped > 0 ? `${skipped} arquivo(s) ignorado(s): ${UPLOAD_RULES_MESSAGE}.` : null);
    if (valid.length === 0) return;

    setUploading({ done: 0, total: valid.length });
    const tags = parseTags(uploadTags);
    for (const [index, file] of valid.entries()) {
      try {
        const asset = await services.assets.upload({ file, folder: uploadFolder.trim() || UNSORTED_FOLDER, kind: uploadKind, tags });
        assets.setData((current) => [asset, ...current]);
        await analyze(asset, file).catch((cause: unknown) => setError(`${asset.name} subiu, mas a análise da IA falhou: ${errorMessage(cause)}`));
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
        <div className="mb-4">
          <NamePicker
            label="Salvar as imagens na pasta"
            options={[...folderCounts.entries()].map(([name, count]) => ({ name, count }))}
            value={uploadFolder}
            onChange={setUploadFolder}
            createLabel="Nova pasta"
            placeholder="Nome da pasta, ex: Ella, Aura, Pinterest"
            hint={uploadFolder.trim() ? `As próximas imagens vão pra "${uploadFolder.trim()}".` : `Sem escolher, vão pra "${UNSORTED_FOLDER}".`}
            disabled={uploading !== null}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          <Field label="Tags para este envio" htmlFor="upload-tags">
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
          <Button variant="primary" loading={uploading !== null} onClick={() => fileInput.current?.click()}>
            {!uploading && <Upload className="size-4" aria-hidden />}
            {uploading ? `Enviando ${uploading.done}/${uploading.total}` : 'Enviar imagens'}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            {canSeeImages
              ? 'A IA olha cada foto enviada e cria as tags sozinha (o que aparece e que temas ela ilustra). As suas tags são opcionais. Dá pra arrastar as imagens pra cá.'
              : 'Modo sem Claude: só entra foto num slide quando alguma tag dela bate com a frase. Capricha nas tags (ex.: café, manhã, rotina, foco). Dá pra arrastar as imagens pra cá.'}
          </p>
          {canSeeImages && assets.data.length > 0 && (
            <Button size="sm" variant="secondary" className="shrink-0" loading={analyzing !== null} onClick={() => void analyzeLibrary()}>
              {!analyzing && <Sparkles className="size-4" aria-hidden />}
              {analyzing ? `Analisando ${analyzing.done}/${analyzing.total}` : 'Analisar fotos com IA'}
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
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
        <FolderList
          counts={folderCounts}
          total={assets.data.length}
          selected={folder}
          onSelect={(name) => {
            setFolder(name);
            // Browsing a folder makes it the upload destination too.
            if (name) setUploadFolder(name);
          }}
          onRename={handleRename}
        />

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
          <NamePicker
            label="Pasta"
            options={folders.map((option) => ({ name: option }))}
            value={folder}
            onChange={setFolder}
            createLabel="Nova pasta"
            placeholder="Nome da pasta"
          />
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
