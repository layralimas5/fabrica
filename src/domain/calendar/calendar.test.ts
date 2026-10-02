import { describe, expect, it } from 'vitest';
import { distribution, monthGrid, repetitionAlerts, weekDays, weeklyPlan, type CalendarItem } from './calendar';

const item = (date: string, theme: string, overrides: Partial<CalendarItem> = {}): CalendarItem => ({
  key: `${date}-${theme}-${Math.random()}`,
  date,
  time: null,
  title: theme,
  accountId: 'a',
  platform: 'tiktok',
  kind: 'carrossel',
  category: 'identificacao',
  theme,
  status: 'pronto',
  experimentId: null,
  carousel: null,
  entry: null,
  ...overrides,
});

describe('calendar', () => {
  it('weeks start on Monday and months are padded to full weeks', () => {
    expect(weekDays('2026-10-08')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    const october = monthGrid('2026-10-15');
    expect(october[0][0]).toBe('2026-09-28');
    expect(october.at(-1)?.at(-1)).toBe('2026-11-01');
  });

  it('warns about 3 contents in a row on the same theme in one account, suggesting other themes', () => {
    const items = [
      item('2026-10-05', 'Disciplina'),
      item('2026-10-06', 'disciplina'),
      item('2026-10-07', 'Disciplina'),
      item('2026-10-08', 'Constância'),
      item('2026-10-06', 'Disciplina', { accountId: 'b' }),
    ];
    const alerts = repetitionAlerts(items);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ accountId: 'a', count: 3, from: '2026-10-05', to: '2026-10-07', suggestions: ['Constância'] });
  });

  it('measures the category mix and the weekly plan', () => {
    const items = [item('2026-10-05', 'A', { category: 'dor', status: 'publicado', experimentId: 'x' }), item('2026-10-06', 'B'), item('2026-10-07', 'B')];
    expect(distribution(items)[0]).toMatchObject({ category: 'identificacao', count: 2 });
    expect(weeklyPlan(items, 21, 3)).toMatchObject({ goal: 21, planned: 3, published: 1, remaining: 20, experiments: 1, activeAccounts: 3 });
  });
});
