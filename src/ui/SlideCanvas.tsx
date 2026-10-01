import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { Slide } from '../domain/carousel';
import { renderCarouselSlide, type RenderContext } from '../app/slideRendering';

interface SlideCanvasProps {
  context: RenderContext;
  slide: Slide;
  index: number;
  scale: number;
  className?: string;
  label: string;
}

/** Renders a slide with the same canvas pipeline used for export, so preview equals output. */
export function SlideCanvas({ context, slide, index, scale, className, label }: SlideCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    renderCarouselSlide(context, slide, index, scale)
      .then((canvas) => {
        if (cancelled || !hostRef.current) return;
        canvas.className = 'block h-auto w-full';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', label);
        hostRef.current.replaceChildren(canvas);
        setFailed(false);
      })
      .catch((error: unknown) => {
        console.error('Falha ao renderizar slide', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [context, slide, index, scale, label]);

  const ratio = context.format === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]';
  return (
    <div className={clsx('relative overflow-hidden bg-subtle', ratio, className)}>
      <div ref={hostRef} className="absolute inset-0" />
      {failed && <p className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-muted">Não consegui desenhar esse slide</p>}
    </div>
  );
}
