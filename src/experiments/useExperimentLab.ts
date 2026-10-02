import { useCallback, useMemo } from 'react';
import { useCalendarEntries, useExperiments } from '../app/data';
import { useServices } from '../app/services';
import { toCarouselInput, type Carousel } from '../domain/carousel';
import { allExperiments, evaluateExperiment, type Experiment, type ExperimentInput, type ExperimentResult, type GroupOf } from '../domain/experiments/experiment';
import { todayIso } from '../domain/schedule';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';

/** Experiments with their members and results, plus the operations the Testes screens need. */
export function useExperimentLab() {
  const services = useServices();
  const stored = useExperiments();
  const entries = useCalendarEntries();
  const library = useWinnerLibrary();
  const today = todayIso();
  const { carousels } = library;

  const experiments = useMemo(() => allExperiments(stored.data, carousels.data), [stored.data, carousels.data]);
  const isStored = useCallback((id: string) => stored.data.some((experiment) => experiment.id === id), [stored.data]);
  const membersOf = useCallback((id: string) => library.items.filter((item) => item.carousel?.experiment?.id === id), [library.items]);
  const plannedOf = useCallback((id: string) => entries.data.filter((entry) => entry.experimentId === id && !entry.recordId).length, [entries.data]);
  const resultOf = useCallback(
    (experiment: Experiment, groupOf?: GroupOf): ExperimentResult => evaluateExperiment(experiment, membersOf(experiment.id), library.scoreValue, today, plannedOf(experiment.id), groupOf),
    [membersOf, plannedOf, library.scoreValue, today],
  );

  const saveCarousel = useCallback(
    async (carousel: Carousel, experiment: Carousel['experiment']) => {
      const saved = await services.carousels.update(carousel.id, toCarouselInput({ ...carousel, experiment }));
      carousels.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    },
    [services.carousels, carousels],
  );

  const create = useCallback(
    async (input: ExperimentInput) => {
      const saved = await services.experiments.create(input);
      stored.setData((current) => [saved, ...current]);
      return saved;
    },
    [services.experiments, stored],
  );

  /** Old format tests exist only on their carousels: saving one turns it into a real experiment. */
  const save = useCallback(
    async (experiment: Experiment, input: ExperimentInput) => {
      if (isStored(experiment.id)) {
        const saved = await services.experiments.update(experiment.id, input);
        stored.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        return saved;
      }
      const saved = await create(input);
      for (const item of membersOf(experiment.id)) {
        if (item.carousel?.experiment) await saveCarousel(item.carousel, { ...item.carousel.experiment, id: saved.id, name: saved.name });
      }
      return saved;
    },
    [isStored, services.experiments, stored, create, membersOf, saveCarousel],
  );

  const remove = useCallback(
    async (experiment: Experiment) => {
      for (const item of membersOf(experiment.id)) if (item.carousel) await saveCarousel(item.carousel, null);
      if (isStored(experiment.id)) {
        await services.experiments.remove(experiment.id);
        stored.setData((current) => current.filter((item) => item.id !== experiment.id));
      }
    },
    [membersOf, saveCarousel, isStored, services.experiments, stored],
  );

  /** Puts a carousel in a test (or takes it out with null) under a version name. */
  const assign = useCallback((carousel: Carousel, experiment: Experiment | null, variant: string) => saveCarousel(carousel, experiment ? { id: experiment.id, name: experiment.name, variant: variant.trim() || 'Variação' } : null), [saveCarousel]);

  return {
    library,
    experiments,
    membersOf,
    resultOf,
    create,
    save,
    remove,
    assign,
    isStored,
    loading: stored.loading || entries.loading || library.loading,
    error: stored.error ?? entries.error ?? library.error,
  };
}
