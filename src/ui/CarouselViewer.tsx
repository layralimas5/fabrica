import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { RenderContext } from '../app/slideRendering';
import type { Carousel } from '../domain/carousel';
import { Dialog } from './primitives';
import { SlideCanvas } from './SlideCanvas';

const SWIPE_THRESHOLD = 40;

interface CarouselViewerProps {
  open: boolean;
  onClose: () => void;
  context: RenderContext;
  carousel: Carousel;
}

/** Phone-sized preview to flip through the carousel the way followers will see it. */
export function CarouselViewer({ open, onClose, context, carousel }: CarouselViewerProps) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const total = carousel.slides.length;
  const tall = carousel.format === '9:16';

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const go = (delta: number) => setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') go(1);
    if (event.key === 'ArrowLeft') go(-1);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (swipeStart.current === null) return;
    const delta = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(delta) > SWIPE_THRESHOLD) go(delta < 0 ? 1 : -1);
  };

  const slide = carousel.slides[index];

  return (
    <Dialog title={`Prévia · ${carousel.title}`} open={open} onClose={onClose} size="md">
      <div onKeyDown={onKeyDown} className="flex flex-col items-center gap-4">
        <div className="relative flex w-full items-center justify-center gap-2">
          <ArrowButton label="Slide anterior" disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeft className="size-5" aria-hidden />
          </ArrowButton>

          <div
            className={clsx('w-full touch-pan-y select-none overflow-hidden rounded-[28px] border-[6px] border-zinc-900 bg-zinc-900 shadow-xl', tall ? 'max-w-[260px]' : 'max-w-[320px]')}
            onPointerDown={(event) => (swipeStart.current = event.clientX)}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
          >
            {slide && <SlideCanvas context={context} slide={slide} index={index} scale={0.42} label={`Slide ${index + 1} de ${total}: ${slide.title}`} className="rounded-[22px]" />}
          </div>

          <ArrowButton label="Próximo slide" disabled={index === total - 1} onClick={() => go(1)}>
            <ChevronRight className="size-5" aria-hidden />
          </ArrowButton>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5" role="tablist" aria-label="Slides">
          {carousel.slides.map((item, dot) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={dot === index}
              aria-label={`Ir para o slide ${dot + 1}`}
              onClick={() => setIndex(dot)}
              className={clsx('h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', dot === index ? 'w-5 bg-ink' : 'w-2 bg-line hover:bg-faint')}
            />
          ))}
        </div>

        <p className="text-xs text-faint" aria-live="polite">
          {index + 1} de {total} · use as setas do teclado ou arraste
        </p>

        {carousel.caption && (
          <div className="w-full rounded-xl bg-subtle p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Legenda</p>
            <p className="whitespace-pre-line text-sm text-ink">{carousel.caption}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink transition-opacity hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}
