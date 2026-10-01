import { Download } from 'lucide-react';
import { useState } from 'react';
import { exportPdf, exportSlide, exportZip, type ImageFormat } from '../app/exportCarousel';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { Alert, Button, Dialog } from '../ui/primitives';

interface ExportMenuProps {
  context: RenderContext;
  carousel: Carousel;
  selectedIndex: number;
  onExported: () => void;
}

type ExportJob = `zip-${ImageFormat}` | 'pdf' | `slide-${ImageFormat}`;

export function ExportMenu({ context, carousel, selectedIndex, onExported }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async (next: ExportJob) => {
    setJob(next);
    setProgress(0);
    setError(null);
    try {
      if (next === 'pdf') await exportPdf(context, carousel, setProgress);
      else if (next.startsWith('zip-')) await exportZip(context, carousel, next.slice(4) as ImageFormat, setProgress);
      else await exportSlide(context, carousel, selectedIndex, next.slice(6) as ImageFormat);
      onExported();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setJob(null);
    }
  };

  const options: { id: ExportJob; label: string; detail: string }[] = [
    { id: 'zip-png', label: 'Todos os slides em PNG', detail: 'ZIP · 1080×1350 · melhor qualidade' },
    { id: 'zip-jpg', label: 'Todos os slides em JPG', detail: 'ZIP · arquivos mais leves' },
    { id: 'pdf', label: 'PDF do carrossel', detail: 'Uma página por slide (LinkedIn)' },
    { id: 'slide-png', label: `Só o slide ${selectedIndex + 1} em PNG`, detail: 'Arquivo único' },
    { id: 'slide-jpg', label: `Só o slide ${selectedIndex + 1} em JPG`, detail: 'Arquivo único' },
  ];

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Download className="size-4" aria-hidden /> Exportar
      </Button>
      <Dialog title="Exportar" open={open} onClose={() => setOpen(false)}>
        <ul className="flex flex-col gap-2">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={job !== null}
                onClick={() => void run(option.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="block text-xs text-muted">{option.detail}</span>
                </span>
                {job === option.id && (
                  <span className="text-xs text-accent" aria-live="polite">
                    {option.id.startsWith('slide') ? 'Gerando…' : `${progress}/${carousel.slides.length}`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Dialog>
    </>
  );
}
