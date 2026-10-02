import { isMeasured, type AnalyticsItem } from '../analytics/items';
import { isScheduled } from '../carousel';
import { addDays } from '../schedule';
import { MEDIUM_SAMPLES, SOLID_SAMPLES, type Experiment, type ExperimentResult } from './experiment';

/** Numbers settle a couple of days after posting: asking before that would record half the result. */
export const MEASURE_AFTER_DAYS = 2;

export interface PendingMeasurement {
  item: AnalyticsItem;
  experiment: Experiment;
  /** Day it was posted. */
  postedOn: string;
  daysSince: number;
}

/** Posted for real: a date in the past and not just waiting on the schedule. */
export function isPosted(item: AnalyticsItem): boolean {
  return Boolean(item.record.publishedAt) && !(item.carousel && isScheduled(item.carousel));
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);

/** "Falta medir": test posts out for two days or more without numbers, oldest first. Concluded tests are left alone. */
export function pendingMeasurements(items: AnalyticsItem[], experiments: Experiment[], today: string): PendingMeasurement[] {
  const open = new Map(experiments.filter((experiment) => !experiment.concludedAt).map((experiment) => [experiment.id, experiment]));
  const limit = addDays(today, -MEASURE_AFTER_DAYS);
  return items
    .flatMap((item) => {
      const experiment = open.get(item.carousel?.experiment?.id ?? '');
      const postedOn = item.record.publishedAt;
      if (!experiment || !postedOn || !isPosted(item) || postedOn > limit || isMeasured(item)) return [];
      return [{ item, experiment, postedOn, daysSince: daysBetween(postedOn, today) }];
    })
    .sort((a, b) => a.postedOn.localeCompare(b.postedOn));
}

/** Waiting for numbers, but not yet due: posted less than two days ago. */
export function awaitsMeasurement(item: AnalyticsItem, today: string): boolean {
  return isPosted(item) && !isMeasured(item) && (item.record.publishedAt ?? today) > addDays(today, -MEASURE_AFTER_DAYS);
}

/** How far the test is from a reliable answer, in posts with metrics. */
export function sampleProgress(result: ExperimentResult): string {
  if (result.variants.length < 2) return 'O teste precisa de pelo menos 2 versões com conteúdos.';
  const missing = (target: number) => result.variants.reduce((sum, variant) => sum + Math.max(0, target - variant.measured), 0);
  const forMedium = missing(MEDIUM_SAMPLES);
  if (forMedium > 0) return `Faltam ${forMedium} ${forMedium === 1 ? 'post' : 'posts'} com métricas pra confiança média (${MEDIUM_SAMPLES} por versão).`;
  const forHigh = missing(SOLID_SAMPLES);
  if (forHigh > 0) return `Já dá pra ler o resultado. Com mais ${forHigh} ${forHigh === 1 ? 'post' : 'posts'} medidos (${SOLID_SAMPLES} por versão), a confiança pode chegar a alta.`;
  return 'Amostra completa: já dá pra concluir o teste.';
}
