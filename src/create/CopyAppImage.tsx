import clsx from 'clsx';
import { ImageIcon, Upload, X } from 'lucide-react';
import type { Asset } from '../domain/asset';
import { AssetThumb } from '../ui/AssetThumb';
import { Button } from '../ui/primitives';

interface CopyAppImageProps {
  index: number;
  /** Image chosen for this copy. */
  asset: Asset | null;
  /** Batch image used when the copy has none of its own. */
  fallback: Asset | null;
  /** The copy has a slide marked APP or PRODUTO, which cannot be created without an image. */
  required: boolean;
  library: boolean;
  uploading: boolean;
  disabled: boolean;
  onUpload: () => void;
  onPick: () => void;
  onClear: () => void;
}

/** App or product image of one copy box: shown in the slide marked APP or PRODUTO of that carousel. */
export function CopyAppImage({ index, asset, fallback, required, library, uploading, disabled, onUpload, onPick, onClear }: CopyAppImageProps) {
  const shown = asset ?? fallback;
  const missing = required && !shown;
  return (
    <div className={clsx('mt-2 flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5', missing ? 'bg-red-500/10 ring-1 ring-red-500/40' : 'bg-subtle')}>
      {shown ? (
        <AssetThumb asset={shown} className={clsx('size-10 shrink-0 rounded-md ring-1 ring-line', !asset && 'opacity-60')} />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface text-faint ring-1 ring-line" aria-hidden>
          <ImageIcon className="size-4" />
        </span>
      )}
      <p className={clsx('min-w-0 flex-1 text-xs', missing ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
        {asset ? 'Imagem do app desta copy' : fallback ? 'Usando a imagem padrão do passo 3' : missing ? 'Tem slide do app: escolha a imagem' : 'Imagem do app (opcional)'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" loading={uploading} onClick={onUpload} disabled={disabled} aria-label={`Enviar imagem do app da copy ${index + 1}`}>
          {!uploading && <Upload className="size-4" aria-hidden />}
          Enviar
        </Button>
        {library && (
          <Button size="sm" variant="secondary" onClick={onPick} disabled={disabled || uploading} aria-label={`Escolher imagem do app da copy ${index + 1} na biblioteca`}>
            Biblioteca
          </Button>
        )}
        {asset && (
          <Button size="sm" variant="ghost" onClick={onClear} disabled={disabled} aria-label={`Tirar a imagem do app da copy ${index + 1}`}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
