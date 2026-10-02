import type { Carousel } from '../domain/carousel';
import { winnerIndex, type RankingGoal } from '../domain/metrics';

export interface Experiment {
  id: string;
  name: string;
  createdAt: string;
  variants: Carousel[];
}

export function groupExperiments(carousels: Carousel[]): Experiment[] {
  const groups = new Map<string, Experiment>();
  for (const carousel of carousels) {
    if (!carousel.experiment) continue;
    const existing = groups.get(carousel.experiment.id);
    if (existing) existing.variants.push(carousel);
    else groups.set(carousel.experiment.id, { id: carousel.experiment.id, name: carousel.experiment.name, createdAt: carousel.createdAt, variants: [carousel] });
  }
  return [...groups.values()]
    .map((experiment) => ({
      ...experiment,
      createdAt: experiment.variants.reduce((oldest, variant) => (variant.createdAt < oldest ? variant.createdAt : oldest), experiment.createdAt),
      variants: [...experiment.variants].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function experimentWinner(experiment: Experiment, goal: RankingGoal): Carousel | null {
  const index = winnerIndex(experiment.variants.map((variant) => variant.metrics), goal);
  return index === null ? null : experiment.variants[index];
}

export function variantLabel(carousel: Carousel): string {
  return carousel.experiment?.variant ?? carousel.title;
}
