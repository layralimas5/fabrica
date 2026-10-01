import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { Asset } from '../domain/asset';
import { keywords, scoreAsset } from '../domain/imageMatching';
import { AssetThumb } from '../ui/AssetThumb';
import { Dialog, EmptyState, Input } from '../ui/primitives';

interface ImagePickerDialogProps {
  open: boolean;
  assets: Asset[];
  currentId: string | null;
  slideText: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** Library picker ranked by how well each image's tags match the slide text. */
export function ImagePickerDialog({ open, assets, currentId, slideText, onPick, onClose }: ImagePickerDialogProps) {
  const [query, setQuery] = useState('');

  const ranked = useMemo(() => {
    const slideWords = keywords(slideText);
    const search = query.trim().toLowerCase();
    return assets
      .filter((asset) => !search || `${asset.name} ${asset.folder} ${asset.tags.join(' ')}`.toLowerCase().includes(search))
      .map((asset) => ({ asset, score: scoreAsset(asset, slideWords) }))
      .sort((a, b) => b.score - a.score);
  }, [assets, slideText, query]);

  return (
    <Dialog title="Trocar imagem" open={open} onClose={onClose} size="xl">
      <Input aria-label="Buscar por nome, pasta ou tag" placeholder="Buscar por nome, pasta ou tag…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />
      {ranked.length === 0 ? (
        <EmptyState title="Nenhuma imagem" description="Sobe imagens na Biblioteca e marca com tags pra IA achar a certa." />
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {ranked.map(({ asset, score }) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onPick(asset.id)}
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
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
