import { describe, expect, it } from 'vitest';
import { projectCounts } from './project';

describe('what a project gathers', () => {
  const project = { id: 'p-mom', name: 'Momentumm' };
  const accounts = [
    { id: 'acc-aura', project: 'Momentumm' },
    { id: 'acc-verdades', project: 'momentumm ' },
    { id: 'acc-lumad', project: 'Lumad' },
  ];
  const connections = [
    { projectId: 'p-mom', accountId: 'acc-aura' },
    { projectId: 'p-mom', accountId: null },
    { projectId: 'p-lumad', accountId: null },
  ];

  it('counts each account once, whether it is a Fábrica account, a connected one or both', () => {
    expect(projectCounts(project, accounts, connections, []).accounts).toBe(3);
  });

  it('counts the carousels with the project name or made for one of its accounts, even under an older folder name', () => {
    const carousels = [
      { project: 'Aura', source: { accountId: 'acc-aura' } },
      { project: 'verdades que ferem', source: { accountId: 'acc-verdades' } },
      { project: 'Momentumm', source: {} },
      { project: 'Aura', source: { accountId: 'acc-lumad' } },
    ];
    expect(projectCounts(project, accounts, connections, carousels).contents).toBe(3);
  });
});
