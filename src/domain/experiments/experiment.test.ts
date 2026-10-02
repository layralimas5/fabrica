import { describe, expect, it } from 'vitest';
import type { Carousel } from '../carousel';
import type { AnalyticsItem } from '../analytics/items';
import { emptyPerformance, emptyRecordInput, type PerformanceMetrics } from '../winners/record';
import { allExperiments, emptyExperiment, evaluateExperiment, sanitizeTimes, testMap, type Experiment } from './experiment';

const experiment: Experiment = { ...emptyExperiment('a'), id: 'exp', name: 'Teste de Gancho #03', createdAt: '2026-09-20', updatedAt: '2026-09-20' };
let sequence = 0;
function member(variant: string, metrics: Partial<PerformanceMetrics> | null, publishedAt = '2026-09-25'): AnalyticsItem {
  sequence += 1;
  return {
    record: { ...emptyRecordInput(), id: `r${sequence}`, title: variant, publishedAt, accountId: 'a', createdAt: '', updatedAt: '', metrics: { ...emptyPerformance(), ...(metrics ?? {}) } },
    carousel: { experiment: { id: 'exp', name: 'Teste', variant } } as Carousel,
    derived: false,
  };
}
const scoreOf = (metrics: PerformanceMetrics) => (metrics.views && metrics.shares !== null ? Math.round((metrics.shares / metrics.views) * 2000) : null);

describe('experiments', () => {
  it('is planned until something is posted, and waits for two measured versions', () => {
    expect(evaluateExperiment(experiment, [], scoreOf, '2026-10-02', 2).status).toBe('planejado');
    const onlyOne = evaluateExperiment(experiment, [member('Educativo', { views: 1000, shares: 14 }), member('Contrarian', null, '2026-09-30')], scoreOf, '2026-10-02');
    expect(onlyOne.leader).toBeNull();
    expect(onlyOne.status).toBe('em_andamento');
    const stale = evaluateExperiment(experiment, [member('Educativo', { views: 1000, shares: 14 }, '2026-09-20')], scoreOf, '2026-10-02');
    expect(stale.status).toBe('dados_insuficientes');
  });

  it('names the leader but keeps confidence low with one content per version', () => {
    const result = evaluateExperiment(experiment, [member('Educativo', { views: 1000, shares: 14 }), member('Contrarian', { views: 1000, shares: 37 }), member('Identificação', { views: 1000, shares: 29 })], scoreOf, '2026-10-02');
    expect(result.leader?.label).toBe('Contrarian');
    expect(result.confidence).toBe('baixa');
    expect(result.message).toContain('poucos dados');
  });

  it('raises confidence only with repeated, clear differences', () => {
    const many = ['A', 'A', 'A', 'B', 'B', 'B'].map((variant) => member(variant, { views: 1000, shares: variant === 'A' ? 40 : 10 }));
    expect(evaluateExperiment(experiment, many, scoreOf, '2026-10-02').confidence).toBe('alta');
    expect(evaluateExperiment({ ...experiment, concludedAt: '2026-10-01' }, many, scoreOf, '2026-10-02').status).toBe('concluido');
  });

  it('a carousel only scheduled for today does not count as posted', () => {
    const scheduled = { ...member('08:00', null, '2026-10-02'), carousel: { experiment: { id: 'exp', name: 'Teste', variant: '08:00' }, status: 'ready', scheduledFor: '2026-10-02' } as Carousel };
    const result = evaluateExperiment(experiment, [scheduled], scoreOf, '2026-10-02');
    expect(result.status).toBe('planejado');
    expect(result.period).toBeNull();
  });

  it('ranks the versions by the metric the test cares about', () => {
    const members = [member('Manhã', { views: 1000, shares: 40, saves: 5 }), member('Noite', { views: 1000, shares: 10, saves: 30 })];
    expect(evaluateExperiment(experiment, members, scoreOf, '2026-10-02').leader?.label).toBe('Manhã');
    expect(evaluateExperiment({ ...experiment, goalMetric: 'saves' }, members, scoreOf, '2026-10-02').leader?.label).toBe('Noite');
  });

  it('keeps posting times valid, sorted and without repeats', () => {
    expect(sanitizeTimes(['19:00', '08:00', '19:00', '25:00', 'manhã'])).toEqual(['08:00', '19:00']);
  });

  it('keeps old format tests as Design experiments and maps what was tested', () => {
    const legacy = allExperiments([], [{ experiment: { id: 'old', name: 'Formato', variant: 'Bold' }, source: {}, createdAt: '2026-09-01', updatedAt: '' } as unknown as Carousel]);
    expect(legacy[0]).toMatchObject({ id: 'old', variable: 'design' });
    const map = testMap([experiment, { ...experiment, id: '2' }, { ...experiment, id: '3' }, { ...experiment, id: '4', variable: 'cta' }]);
    expect(map.find((row) => row.variable === 'gancho')?.level).toBe('bastante');
    expect(map.find((row) => row.variable === 'cta')?.level).toBe('pouco');
    expect(map.find((row) => row.variable === 'horario')?.level).toBe('nunca');
  });
});
