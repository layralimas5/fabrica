import { ImagePlus, Images, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { Asset } from '../domain/asset';
import { isAcceptedImage, UPLOAD_RULES_MESSAGE } from '../domain/asset';
import { ImagePickerDialog } from '../editor/ImagePickerDialog';
import { AssetThumb } from '../ui/AssetThumb';
import { Button } from '../ui/primitives';
import type { PictureSource } from './scenePictures';

interface ScenePickerProps {
  label: string;
  /** Spoken text of the scene: ranks the library photos that fit it. */
  text: string;
  value: PictureSource | null;
  /** Shown faded when the scene has no picture of its own. */
  fallback: PictureSource | null;
  assets: Asset[];
  onChange: (value: PictureSource | null) => void;
  onError: (message: string) => void;
}

function Thumb({ source, faded }: { source: PictureSource; faded?: boolean }) {
  const className = `size-full object-cover ${faded ? 'opacity-40' : ''}`;
  if (source.kind === 'asset') return <AssetThumb asset={source.asset} className={className} />;
  return <img src={source.url} alt="" className={className} />;
}

/** Picture of one scene: from the computer or from the Biblioteca. */
export function ScenePicker({ label, text, value, fallback, assets, onChange, onError }: ScenePickerProps) {
  const inputId = useId();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const shown = value ?? fallback;

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      onError(`Essa imagem não entrou: ${UPLOAD_RULES_MESSAGE}.`);
      return;
    }
    onChange({ kind: 'file', file, url: URL.createObjectURL(file) });
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-lg bg-subtle">{shown && <Thumb source={shown} faded={!value} />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{text}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <label htmlFor={inputId} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-subtle focus-within:ring-2 focus-within:ring-accent">
            <ImagePlus className="size-3.5" aria-hidden /> Do computador
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                pickFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
          <Button size="sm" onClick={() => setLibraryOpen(true)} disabled={assets.length === 0}>
            <Images className="size-3.5" aria-hidden /> Da Biblioteca
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={`Tirar a imagem de ${label}`}>
              <X className="size-3.5" aria-hidden /> Tirar
            </Button>
          )}
        </div>
      </div>
      <ImagePickerDialog
        open={libraryOpen}
        title={`Imagem: ${label}`}
        assets={assets}
        currentId={value?.kind === 'asset' ? value.asset.id : null}
        slideText={text}
        carouselFolders={[]}
        onClose={() => setLibraryOpen(false)}
        onPick={(id) => {
          const asset = assets.find((item) => item.id === id);
          if (asset) onChange({ kind: 'asset', asset });
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}
