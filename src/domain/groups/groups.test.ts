import { describe, expect, it } from 'vitest';
import { emptyGroup, groupBlock, groupVersion, normalizeGroupUrl, sanitizeDistributionInput, sanitizeGroupInput, scheduleDays, type FacebookGroup, type GroupDistribution } from './groups';

const group = (patch: Partial<FacebookGroup> = {}): FacebookGroup => ({ ...emptyGroup(null), id: 'g1', name: 'Mochileiras', url: 'https://www.facebook.com/groups/mochileiras/', createdAt: '', updatedAt: '', ...patch });
const posted = (date: string, status: GroupDistribution['status'] = 'published') => ({ ...sanitizeDistributionInput({ groupId: 'g1', date, status }), id: date, createdAt: '', updatedAt: '' });

describe('groups', () => {
  it('accepts only facebook.com group addresses', () => {
    expect(normalizeGroupUrl('https://m.facebook.com/groups/123456/?ref=share')).toBe('https://www.facebook.com/groups/123456/');
    expect(normalizeGroupUrl('https://www.facebook.com/lumad')).toBe('');
    expect(normalizeGroupUrl('https://evil.com/groups/x')).toBe('');
    expect(sanitizeGroupInput({ minDaysBetween: 0 }).minDaysBetween).toBe(1);
  });

  it('blocks forbidden groups and posts closer than the group interval', () => {
    expect(groupBlock(group({ policy: 'forbidden' }), [], '2026-10-20')).toMatch(/não permite/);
    expect(groupBlock(group({ minDaysBetween: 14 }), [posted('2026-10-10')], '2026-10-20')).toMatch(/14 dias/);
    expect(groupBlock(group({ minDaysBetween: 14 }), [posted('2026-10-01')], '2026-10-20')).toBeNull();
    expect(groupBlock(group({ minDaysBetween: 14 }), [posted('2026-10-10', 'not_allowed')], '2026-10-20')).toBeNull();
  });

  it('places the link the way each group allows and varies the opener between groups', () => {
    const base = 'Roteiro de 3 dias em Lisboa gastando pouco.';
    const allowed = groupVersion({ base, group: group({ policy: 'allowed', theme: 'viagem solo' }), index: 0, link: 'https://f.app/l/abc' });
    expect(allowed).toContain('Pra quem curte viagem solo:');
    expect(allowed).toContain('https://f.app/l/abc');
    const comments = groupVersion({ base, group: group({ policy: 'allowed', linkInComments: true }), index: 1, link: 'https://f.app/l/abc' });
    expect(comments).not.toContain('https://f.app/l/abc');
    expect(comments).toContain('link nos comentários');
    const ask = groupVersion({ base, group: group({ policy: 'ask_admin' }), index: 2, link: 'https://f.app/l/abc' });
    expect(ask).not.toContain('https://');
    expect(new Set([0, 1, 2, 3].map((index) => groupVersion({ base, group: group(), index, link: null }).split('\n')[0])).size).toBe(4);
  });

  it('spreads the groups over the days', () => {
    expect(scheduleDays('2026-10-20', 5, 2)).toEqual(['2026-10-20', '2026-10-20', '2026-10-21', '2026-10-21', '2026-10-22']);
  });

  it('keeps only facebook post links and non-negative results', () => {
    const clean = sanitizeDistributionInput({ postUrl: 'https://evil.com/x', results: { reactions: -3, comments: 4.7 } });
    expect(clean.postUrl).toBe('');
    expect(clean.results).toEqual({ reactions: null, comments: 4 });
  });
});
