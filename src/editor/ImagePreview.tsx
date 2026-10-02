import { ArrowLeft, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Asset } from '../domain/asset';
import { AssetThumb } from '../ui/AssetThumb';
import { Button } from '../ui/primitives';

interface ImagePreviewProps {
  asset: Asset;
  /** Position in the picker list, for "3 de 12". */
  position: number;
  total: number;
  current: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
  onPick: () => void;
}

/** The whole image, uncropped, so the user checks it before using it. Arrows walk the list; Esc goes back to the grid. */
export function ImagePreview({ asset, position, total, current, onPrevious, onNext, onBack, onPick }: ImagePreviewProps) {
  const pickButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    pickButton.current?.focus();
  }, [asset.id]);

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onPrevious();
    else if (event.key === 'ArrowRight') onNext();
    else if (event.key === 'Escape') {
      // Esc closes only the preview, not the whole picker.
      event.preventDefault();
      event.stopPropagation();
      onBack();
    } else return;
    event.preventDefault();
  };

  return (
    <div role="group" aria-label={`Imagem ${position + 1} de ${total}: ${asset.name}`} onKeyDown={handleKeys} className="flex flex-col gap-3">
      <div className="relative grid place-items-center rounded-xl bg-subtle">
        <AssetThumb asset={asset} fit="contain" className="h-[min(62dvh,720px)] w-full bg-transparent" />
        {total > 1 && (
          <>
            <Button variant="secondary" size="sm" aria-label="Imagem anterior" onClick={onPrevious} className="absolute left-2 top-1/2 -translate-y-1/2 shadow-md">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" aria-label="Próxima imagem" onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 shadow-md">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-xs text-muted">
          <p className="truncate font-medium text-ink">{asset.name}</p>
          <p className="truncate">
            {asset.folder} · {asset.width}×{asset.height}
            {asset.tags.length > 0 && ` · ${asset.tags.slice(0, 5).join(', ')}`} · {position + 1} de {total}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </Button>
          <Button ref={pickButton} variant="primary" onClick={onPick}>
            <Check className="size-4" aria-hidden /> {current ? 'Manter esta imagem' : 'Usar esta imagem'}
          </Button>
        </div>
      </div>
    </div>
  );
}
