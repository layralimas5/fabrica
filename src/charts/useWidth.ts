import { useEffect, useRef, useState } from 'react';

/** Width of an element, kept current on resize, so SVG charts draw at real pixels (crisp text, no stretching). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);

  return { ref, width };
}
