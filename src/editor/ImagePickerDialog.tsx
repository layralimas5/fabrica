import clsx from 'clsx';
import { Maximize2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { inFolders, type Asset } from '../domain/asset';
import { keywords, scoreAsset } from '../domain/imageMatching';
import { AssetThumb } from '../ui/AssetThumb';
import { ImagePreview } from './ImagePreview';
import { Dialog, EmptyState, Input, Select } from '../ui/primitives';

const SCOPE_ALL = '__all__';
const SCOPE_CAROUSEL = '__carousel__';

interface ImagePickerDialogProps {
  open: boolean;
  title?: string;
  assets: Asset[];
  currentId: string | null;
  slideText: string;
  /** Folders chosen for this carousel; empty means all. */
  carouselFolders: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}

/** Library picker ranked by how well each image's tags match the slide text. Any image can be opened whole before picking. */
export function ImagePickerDialog({ open, title = 'Trocar imagem', assets, currentId, slideText, carouselFolders, onPick, onClose }: ImagePickerDialogProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<string>(carouselFolders.length > 0 ? SCOPE_CAROUSEL : SCOPE_ALL);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const allFolders = useMemo(() => [...new Set(assets.map((asset) => asset.folder))].sort((a, b) => a.localeCompare(b)), [assets]);
  const scopeFolders = useMemo(() => (scope === SCOPE_ALL ? [] : scope === SCOPE_CAROUSEL ? carouselFolders : [scope]), [scope, carouselFolders]);

  const ranked = useMemo(() => {
    const slideWords = keywords(slideText);
    const search = query.trim().toLowerCase();
    return assets
      .filter((asset) => inFolders(asset, scopeFolders))
      .filter((asset) => !search || `${asset.name} ${asset.folder} ${asset.tags.join(' ')}`.toLowerCase().includes(search))
      .map((asset) => ({ asset, score: scoreAsset(asset, slideWords) }))
      .sort((a, b) => b.score - a.score);
  }, [assets, slideText, query, scopeFolders]);

  const previewIndex = ranked.findIndex(({ asset }) => asset.id === previewId);
  const stepPreview = (step: number) => setPreviewId(ranked[(previewIndex + step + ranked.length) % ranked.length].asset.id);
  const close = () => {
    setPreviewId(null);
    onClose();
  };
  const pick = (id: string) => {
    setPreviewId(null);
    onPick(id);
  };

  return (
    <Dialog title={title} open={open} onClose={close} size="xl">
      {previewIndex >= 0 ? (
        <ImagePreview
          asset={ranked[previewIndex].asset}
          position={previewIndex}
          total={ranked.length}
          current={ranked[previewIndex].asset.id === currentId}
          onPrevious={() => stepPreview(-1)}
          onNext={() => stepPreview(1)}
          onBack={() => setPreviewId(null)}
          onPick={() => pick(ranked[previewIndex].asset.id)}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
            <Select aria-label="Pastas" value={scope} onChange={(e) => setScope(e.target.value)}>
              {carouselFolders.length > 0 && <option value={SCOPE_CAROUSEL}>Pastas deste carrossel</option>}
              <option value={SCOPE_ALL}>Todas as pastas</option>
              {allFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </Select>
            <Input aria-label="Buscar por nome, pasta ou tag" placeholder="Buscar por nome, pasta ou tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {ranked.length === 0 ? (
            <EmptyState title="Nenhuma imagem" description="Sobe imagens na Biblioteca e marca com tags pra IA achar a certa." />
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {ranked.map(({ asset, score }) => (
                <li key={asset.id} className="relative">
                  <button
                    type="button"
                    onClick={() => pick(asset.id)}
                    className={clsx(
                      'group block w-full overflow-hidden rounded-xl text-left ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      asset.id === currentId ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
                    )}
                  >
                    <AssetThumb asset={asset} className="aspect-square" />
                    <span className="block truncate px-2 py-1.5 text-[11px] text-muted">
                      {score > 0 && <span className="mr-1 text-accent">●</span>}
                      {asset.tags.slice(0, 3).join(', ') || asset.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewId(asset.id)}
                    aria-label={`Ver ${asset.name} inteira`}
                    title="Ver inteira"
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-lg bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Maximize2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
