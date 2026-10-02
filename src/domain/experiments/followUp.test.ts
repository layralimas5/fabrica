import { describe, expect, it } from 'vitest';
import type { AnalyticsItem } from '../analytics/items';
import type { Carousel } from '../carousel';
import { spreadTimesOverWeekdays } from '../schedule';
import { emptyPerformance, emptyRecordInput, type PerformanceMetrics } from '../winners/record';
import { versionDimensions } from './brief';
import { emptyExperiment, type Experiment, type ExperimentResult, type VariantResult } from './experiment';
import { pendingMeasurements, sampleProgress } from './followUp';
import { winnerPlan } from './winner';

const experiment: Experiment = { ...emptyExperiment('a'), id: 'exp', name: 'Teste de Horário #01', createdAt: '', updatedAt: '' };
let sequence = 0;
function item(publishedAt: string | null, options: { metrics?: Partial<PerformanceMetrics>; status?: Carousel['status']; scheduledFor?: string | null; experimentId?: string } = {}): AnalyticsItem {
  sequence += 1;
  return {
    record: { ...emptyRecordInput(), id: `r${sequence}`, title: `post ${sequence}`, publishedAt, accountId: 'a', createdAt: '', updatedAt: '', metrics: { ...emptyPerformance(), ...(options.metrics ?? {}) } },
    carousel: { id: `c${sequence}`, status: options.status ?? 'published', scheduledFor: options.scheduledFor ?? null, experiment: { id: options.experimentId ?? 'exp', name: 'Teste', variant: '08:00' } } as Carousel,
    derived: false,
  };
}

describe('falta medir', () => {
  it('lists test posts out for 2 days or more without numbers, oldest first', () => {
    const items = [
      item('2026-09-30'),
      item('2026-09-25'),
      item('2026-10-01'),
      item('2026-09-28', { metrics: { views: 1000, saves: 10 } }),
      item('2026-09-20', { status: 'ready', scheduledFor: '2026-09-20' }),
      item('2026-09-20', { experimentId: 'other' }),
    ];
    const pending = pendingMeasurements(items, [experiment], '2026-10-02');
    expect(pending.map((entry) => entry.postedOn)).toEqual(['2026-09-25', '2026-09-30']);
    expect(pending[0].daysSince).toBe(7);
    expect(pendingMeasurements(items, [{ ...experiment, concludedAt: '2026-10-01' }], '2026-10-02')).toHaveLength(0);
  });

  it('says how many measured posts are missing for each level of confidence', () => {
    const variant = (measured: number): VariantResult => ({ label: String(measured), items: [], measured, averageScore: null, shareRate: null, saveRate: null, followRate: null });
    const result = (measured: number[]) => ({ variants: measured.map(variant) }) as unknown as ExperimentResult;
    expect(sampleProgress(result([1, 0]))).toBe('Faltam 3 posts com métricas pra confiança média (2 por versão).');
    expect(sampleProgress(result([2, 2]))).toContain('mais 2 posts medidos');
    expect(sampleProgress(result([3, 4]))).toBe('Amostra completa: já dá pra concluir o teste.');
    expect(sampleProgress(result([5]))).toContain('pelo menos 2 versões');
  });
});

describe('aplicar o vencedor', () => {
  it('a winning time and model become account defaults; copy winners become a learning', () => {
    const tested: Experiment = {
      ...experiment,
      goalMetric: 'saves',
      variables: ['gancho', 'design', 'horario'],
      details: { gancho: { control: 'Lista de dicas', variation: 'Frase contrarian' }, design: { control: '', variation: '' } },
    };
    const [copy, style, time] = versionDimensions(tested.variables);
    const plan = winnerPlan(tested, [
      { dimension: copy, leader: 'Variação', runnerUp: 'Controle', confidence: 'media' },
      { dimension: style, leader: 'TikTok (foto + texto)', runnerUp: 'Minimalista', confidence: 'baixa' },
      { dimension: time, leader: '19:00', runnerUp: '08:00', confidence: 'alta' },
    ]);
    expect(plan.defaults).toEqual({ postingTime: '19:00', visualStyle: 'tiktok', source: 'Teste de Horário #01' });
    expect(plan.learning).toContain('Gancho: "Frase contrarian" teve mais salvamentos que "Lista de dicas"');
    expect(plan.learning).toContain('Horário: 19:00 teve mais salvamentos (contra 08:00), confiança: alta.');
    expect(plan.changes).toEqual(['Aprendizado nas sugestões do Analytics: Variação de Gancho', 'Modelo de slide padrão da conta: TikTok (foto + texto)', 'Horário padrão da conta: 19:00']);
  });

  it('a copy-only test changes no default', () => {
    const tested: Experiment = { ...experiment, variables: ['cta'], details: { cta: { control: 'Salva', variation: 'Manda' } } };
    const plan = winnerPlan(tested, [{ dimension: versionDimensions(['cta'])[0], leader: 'Controle', runnerUp: 'Variação', confidence: null }]);
    expect(plan.defaults).toEqual({});
    expect(plan.learning).toBe('CTA: "Salva" teve mais performance score que "Manda".');
  });
});

describe('dias equilibrados no teste de horário', () => {
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

  it('gives each time a similar mix of weekdays instead of fixed days', () => {
    // 8 posts, 1 per day from a Friday: in order, 08:00 would get Fri/Sun/Tue/Thu and 19:00 Sat/Mon/Wed/Fri.
    const dates = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    const times = ['08:00', '19:00', '08:00', '19:00', '08:00', '19:00', '08:00', '19:00'];
    const spread = spreadTimesOverWeekdays(dates, times);
    expect([...spread].sort()).toEqual(dates);
    const weekdaysOf = (time: string) => new Set(spread.filter((_, index) => times[index] === time).map(weekday));
    expect(weekdaysOf('08:00').size).toBe(4);
    expect(weekdaysOf('19:00').size).toBe(4);
  });

  it('never puts two posts at the same time on the same day while another day is free', () => {
    const dates = ['2026-10-02', '2026-10-02', '2026-10-03', '2026-10-03'];
    const spread = spreadTimesOverWeekdays(dates, ['08:00', '08:00', '19:00', '19:00']);
    expect(new Set([`${spread[0]}`, `${spread[1]}`]).size).toBe(2);
    expect(new Set([`${spread[2]}`, `${spread[3]}`]).size).toBe(2);
  });
});
