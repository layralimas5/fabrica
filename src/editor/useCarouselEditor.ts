import type { ImageShade } from '../domain/shade';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CarouselRepository } from '../application/ports';
import { blankSlide, duplicateSlide, moveItem, type Carousel, type CarouselFormat, type CarouselStatus, type Slide, type SlideStyle } from '../domain/carousel';
import { MAX_COPY_SLIDES } from '../domain/content';
import { errorMessage } from '../app/useResource';

const AUTOSAVE_DELAY = 700;

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export function useCarouselEditor(repo: CarouselRepository, initial: Carousel) {
  const [carousel, setCarousel] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.slides[0]?.id ?? '');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(carousel);
  const dirty = useRef(false);

  useEffect(() => {
    latest.current = carousel;
    if (!dirty.current) return;
    setSaveState('pending');
    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        const { id, createdAt: _c, updatedAt: _u, ...input } = latest.current;
        await repo.update(id, input);
        setSaveState('saved');
        setSaveError(null);
      } catch (cause) {
        setSaveState('error');
        setSaveError(errorMessage(cause));
      }
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [carousel, repo]);

  const mutate = useCallback((update: (current: Carousel) => Carousel) => {
    dirty.current = true;
    setCarousel((current) => {
      const next = update(current);
      return next.status === 'draft' && next !== current ? { ...next, status: 'editing' } : next;
    });
  }, []);

  const updateSlide = useCallback(
    (id: string, patch: Partial<Slide>) =>
      mutate((current) => ({ ...current, slides: current.slides.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide)) })),
    [mutate],
  );

  const insertAfter = useCallback(
    (id: string, slide: Slide) => {
      mutate((current) => {
        if (current.slides.length >= MAX_COPY_SLIDES) return current;
        const index = current.slides.findIndex((item) => item.id === id);
        const slides = [...current.slides];
        slides.splice(index + 1, 0, slide);
        return { ...current, slides };
      });
      setSelectedId(slide.id);
    },
    [mutate],
  );

  const addSlide = useCallback((afterId: string) => insertAfter(afterId, blankSlide()), [insertAfter]);

  const duplicate = useCallback(
    (id: string) => {
      const source = latest.current.slides.find((slide) => slide.id === id);
      if (source) insertAfter(id, duplicateSlide(source));
    },
    [insertAfter],
  );

  const removeSlide = useCallback(
    (id: string) => {
      const slides = latest.current.slides;
      if (slides.length <= 1) return;
      const index = slides.findIndex((slide) => slide.id === id);
      const neighbour = slides[index + 1] ?? slides[index - 1];
      mutate((current) => ({ ...current, slides: current.slides.filter((slide) => slide.id !== id) }));
      setSelectedId(neighbour.id);
    },
    [mutate],
  );

  const reorder = useCallback((ids: string[]) => {
    mutate((current) => ({ ...current, slides: ids.map((id) => current.slides.find((slide) => slide.id === id)).filter((slide): slide is Slide => Boolean(slide)) }));
  }, [mutate]);

  const move = useCallback(
    (id: string, direction: -1 | 1) =>
      mutate((current) => {
        const index = current.slides.findIndex((slide) => slide.id === id);
        return { ...current, slides: moveItem(current.slides, index, index + direction) };
      }),
    [mutate],
  );

  /** Text size, width and line spacing are carousel-wide: changing one slide changes all. */
  const setTextStyleForAll = useCallback(
    (patch: Partial<Pick<SlideStyle, 'fontScale' | 'textWidth' | 'lineHeight'>>) =>
      mutate((current) => ({ ...current, slides: current.slides.map((slide) => ({ ...slide, style: { ...slide.style, ...patch } })) })),
    [mutate],
  );
  const setPlan = useCallback(
    (patch: Partial<Pick<Carousel, 'project' | 'folder' | 'scheduledFor'>>) => mutate((current) => ({ ...current, ...patch })),
    [mutate],
  );
  const setAccount = useCallback(
    (accountId: string | null) => mutate((current) => ({ ...current, source: { ...current.source, accountId } })),
    [mutate],
  );
  /** Theme and tags: what the carousel is about, crossed with performance in Analytics. */
  const setLabels = useCallback(
    (labels: { theme?: string; tags?: string[] }) => mutate((current) => ({ ...current, source: { ...current.source, ...labels } })),
    [mutate],
  );
  /** Joins (or leaves, with null) an experiment, under a variant name such as "Controle" or "Gancho contrarian". */
  const setExperiment = useCallback((experiment: Carousel['experiment']) => mutate((current) => ({ ...current, experiment })), [mutate]);
  const setSchedule = useCallback(
    (schedule: { scheduledTime?: string | null; category?: Carousel['source']['category'] }) => mutate((current) => ({ ...current, source: { ...current.source, ...schedule } })),
    [mutate],
  );
  const setShade = useCallback(
    (shade: ImageShade) => mutate((current) => ({ ...current, source: { ...current.source, shade } })),
    [mutate],
  );
  const setTitle = useCallback((title: string) => mutate((current) => ({ ...current, title })), [mutate]);
  const setCaption = useCallback((caption: string) => mutate((current) => ({ ...current, caption })), [mutate]);
  const setFormat = useCallback((format: CarouselFormat) => mutate((current) => ({ ...current, format })), [mutate]);
  const setStatus = useCallback((status: CarouselStatus) => {
    dirty.current = true;
    setCarousel((current) => ({ ...current, status }));
  }, []);

  return { carousel, selectedId, setSelectedId, saveState, saveError, updateSlide, setTextStyleForAll, setShade, setAccount, setPlan, setLabels, setExperiment, setSchedule, addSlide, duplicate, removeSlide, reorder, move, setTitle, setCaption, setFormat, setStatus };
}

export type CarouselEditor = ReturnType<typeof useCarouselEditor>;
