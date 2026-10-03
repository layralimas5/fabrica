import clsx from 'clsx';
import { Reorder } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { Slide } from '../domain/carousel';
import { MAX_COPY_SLIDES, ROLE_LABELS } from '../domain/content';
import type { RenderContext } from '../app/slideRendering';
import { SlideCanvas } from '../ui/SlideCanvas';

interface FilmstripProps {
  context: RenderContext;
  slides: Slide[];
  selectedId: string;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: () => void;
}

const THUMB_SCALE = 0.16;

export function Filmstrip({ context, slides, selectedId, onSelect, onReorder, onAdd }: FilmstripProps) {
  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-3" aria-label="Slides do carrossel">
      <Reorder.Group axis="x" values={slides.map((slide) => slide.id)} onReorder={onReorder} className="flex gap-3">
        {slides.map((slide, index) => (
          <Reorder.Item key={slide.id} value={slide.id} className="w-24 shrink-0 sm:w-28" whileDrag={{ scale: 1.05, zIndex: 10 }}>
            <button
              type="button"
              onClick={() => onSelect(slide.id)}
              aria-current={slide.id === selectedId}
              aria-label={`Slide ${index + 1}, ${ROLE_LABELS[slide.role]}`}
              className={clsx(
                'block w-full overflow-hidden rounded-xl ring-offset-2 ring-offset-canvas transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                slide.id === selectedId ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
              )}
            >
              <SlideCanvas context={context} slide={slide} index={index} scale={THUMB_SCALE} label="" className="pointer-events-none" />
            </button>
            <p className="mt-1.5 truncate text-center text-[11px] text-muted">
              {index + 1} · {ROLE_LABELS[slide.role]}
            </p>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {slides.length < MAX_COPY_SLIDES && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Adicionar slide depois do selecionado"
          className="grid aspect-[4/5] w-24 shrink-0 place-items-center rounded-xl border border-dashed border-line text-muted transition-colors hover:border-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-28"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
