import { Move } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { FORMAT_SIZES, type Slide } from '../domain/carousel';
import type { RenderContext } from '../app/slideRendering';
import { SlideCanvas } from '../ui/SlideCanvas';

const STAGE_SCALE = 0.6;
const KEY_STEP = 12;
const MAX_OFFSET = 400;

interface SlideStageProps {
  context: RenderContext;
  slide: Slide;
  index: number;
  onMove: (offsetX: number, offsetY: number) => void;
}

/** Large preview where the text block can be dragged (pointer) or nudged (arrow keys). */
export function SlideStage({ context, slide, index, onMove }: SlideStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number; ratio: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (value: number) => Math.round(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const width = ref.current?.getBoundingClientRect().width ?? 1;
    drag.current = { x: event.clientX, y: event.clientY, offsetX: slide.style.offsetX, offsetY: slide.style.offsetY, ratio: FORMAT_SIZES[context.format].width / width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    onMove(clamp(start.offsetX + (event.clientX - start.x) * start.ratio), clamp(start.offsetY + (event.clientY - start.y) * start.ratio));
  };

  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onMove(clamp(slide.style.offsetX + delta[0]), clamp(slide.style.offsetY + delta[1]));
  };

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div
        ref={ref}
        tabIndex={0}
        role="application"
        aria-label={`Slide ${index + 1}. Arraste ou use as setas para mover o texto.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={`touch-none select-none overflow-hidden rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] ring-1 ring-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <SlideCanvas context={context} slide={slide} index={index} scale={STAGE_SCALE} label={`Prévia do slide ${index + 1}: ${slide.title}`} />
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-faint">
        <Move className="size-3.5" aria-hidden /> Arraste o slide pra mover o texto
      </p>
    </div>
  );
}
