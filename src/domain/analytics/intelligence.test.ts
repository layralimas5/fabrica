import { describe, expect, it } from 'vitest';
import { emptyPerformance, emptyRecordInput, type ContentRecord, type PerformanceMetrics } from '../winners/record';
import { guidanceFor, hasRecommendations, planCopies, recommend } from './intelligence';

let sequence = 0;
function record(overrides: Partial<Omit<ContentRecord, 'metrics'>> & { metrics?: Partial<PerformanceMetrics> } = {}): ContentRecord {
  sequence += 1;
  const { metrics, ...rest } = overrides;
  return { ...emptyRecordInput(), id: `r${sequence}`, createdAt: '', updatedAt: '', ...rest, metrics: { ...emptyPerformance(), views: 1000, ...metrics } };
}

/** Score stand-in: shares per mille. */
const scoreOf = (metrics: PerformanceMetrics) => metrics.shares;

describe('content intelligence', () => {
  const measured = [
    record({ visualStyle: 'tiktok', contentType: 'dor', hookType: 'confronto', slideCount: 7, theme: 'Constância', metrics: { shares: 90 } }),
    record({ visualStyle: 'tiktok', contentType: 'dor', hookType: 'confronto', slideCount: 7, theme: 'Constância', metrics: { shares: 80 } }),
    record({ visualStyle: 'bold', contentType: 'lista', hookType: 'lista', slideCount: 10, theme: 'Metas', metrics: { shares: 30 } }),
  ];
  const recommendations = recommend(measured, measured, scoreOf);

  it('recommends only patterns above the account usual with at least 2 contents', () => {
    expect(recommendations.template?.value).toBe('tiktok');
    expect(recommendations.contentType?.value).toBe('dor');
    expect(recommendations.slideCount?.value).toBe(7);
    expect(recommendations.hooks.map((hook) => hook.value)).toEqual(['confronto']);
    expect(recommendations.themes.map((theme) => theme.label)).toEqual(['Constância']);
  });

  it('says nothing without enough data', () => {
    expect(hasRecommendations(recommend([measured[0]], [measured[0]], scoreOf))).toBe(false);
  });

  it('safe uses the winners everywhere, balanced alternates, experimental only tests', () => {
    expect(planCopies(3, 'safe', recommendations).every((plan) => plan.mode === 'winner' && plan.style === 'tiktok' && plan.slideCount === 7)).toBe(true);
    expect(planCopies(4, 'balanced', recommendations).map((plan) => plan.mode)).toEqual(['winner', 'explore', 'winner', 'explore']);
    const experimental = planCopies(2, 'experimental', recommendations);
    expect(experimental.every((plan) => plan.mode === 'explore' && plan.style !== 'tiktok')).toBe(true);
    expect(experimental[0].style).not.toBe(experimental[1].style);
  });

  it('briefs the writing AI with the winners, and tells it when a copy is a test', () => {
    expect(guidanceFor(recommendations, planCopies(1, 'safe', recommendations)[0])).toContain('confronto');
    expect(guidanceFor(recommendations, planCopies(1, 'experimental', recommendations)[0])).toContain('teste');
  });
});
