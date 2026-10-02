import { describe, expect, it } from 'vitest';
import { briefProblems, defaultBrief, slotFor, switchVariable } from './brief';

describe('ficha do teste', () => {
  it('switching the variable swaps untouched suggestions and keeps what the user wrote', () => {
    const fromTemplate = switchVariable(defaultBrief('template', 3), 'horario');
    expect(fromTemplate).toMatchObject({ name: 'Teste de Horário #03', control: '', variation: '', times: ['08:00', '19:00'] });

    const written = { ...defaultBrief('gancho'), name: 'Noite x manhã', hypothesis: 'Minha hipótese', times: ['07:30'] };
    expect(switchVariable(written, 'horario')).toMatchObject({ name: 'Noite x manhã', hypothesis: 'Minha hipótese', times: ['07:30', '19:00'] });
    expect(switchVariable({ ...written, times: ['07:30', '21:00'] }, 'cta').times).toEqual(['07:30']);
  });

  it('a time test takes turns over the times; other tests keep one time for every version', () => {
    const byTime = { ...defaultBrief('horario'), times: ['21:00', '07:00'] };
    expect([0, 1, 2].map((position) => slotFor(byTime, { copyIndex: position, position, styleLabel: 'Bold', copyVersion: null }))).toEqual([
      { variant: '07:00', time: '07:00' },
      { variant: '21:00', time: '21:00' },
      { variant: '07:00', time: '07:00' },
    ]);
    const byHook = { ...defaultBrief('gancho'), times: ['18:00'] };
    expect(slotFor(byHook, { copyIndex: 1, position: 1, styleLabel: 'Bold', copyVersion: null })).toEqual({ variant: 'Variação', time: '18:00' });
    expect(slotFor(defaultBrief('design'), { copyIndex: 0, position: 0, styleLabel: 'Bold', copyVersion: 'Controle' })).toEqual({ variant: 'Bold', time: null });
  });

  it('explains what keeps the test from comparing anything', () => {
    expect(briefProblems({ ...defaultBrief('horario'), times: ['08:00'] }, { carousels: 4, styles: 1, copyVersions: [] })).toEqual(['Pra testar horário, coloque pelo menos 2 horários diferentes.']);
    expect(briefProblems(defaultBrief('design'), { carousels: 2, styles: 1, copyVersions: [] })[0]).toContain('2 modelos');
    expect(briefProblems({ ...defaultBrief('cta'), name: ' ' }, { carousels: 2, styles: 1, copyVersions: ['Controle', 'Variação'] })).toEqual(['Dê um nome pro teste.']);
  });
});
