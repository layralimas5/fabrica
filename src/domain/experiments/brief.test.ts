import { describe, expect, it } from 'vitest';
import { briefProblems, defaultBrief, experimentFromBrief, setVariables, slotFor, slotPlanner, versionDimensions, versionPart } from './brief';
import { sanitizeExperimentInput, variablesLabel } from './experiment';

describe('ficha do teste', () => {
  it('selecting more things keeps what the user wrote and asks for the new ones', () => {
    const start = defaultBrief(['gancho'], 3);
    const filled = { ...start, details: { gancho: { control: 'Gancho A', variation: 'Gancho B' } } };
    const both = setVariables(filled, ['gancho', 'horario']);
    expect(both.name).toBe('Teste de Gancho + Horário #03');
    expect(both.details).toEqual({ gancho: { control: 'Gancho A', variation: 'Gancho B' }, horario: { control: '', variation: '' } });
    expect(both.times).toEqual(['08:00', '19:00']);

    const written = { ...both, name: 'Noite x manhã', hypothesis: 'Minha hipótese' };
    const onlyCta = setVariables(written, ['cta']);
    expect(onlyCta).toMatchObject({ name: 'Noite x manhã', hypothesis: 'Minha hipótese', times: ['08:00'] });
    expect(Object.keys(onlyCta.details)).toEqual(['cta']);
  });

  it('a time test takes turns over the times; other tests keep one time for every version', () => {
    const byTime = { ...defaultBrief(['horario']), times: ['21:00', '07:00'] };
    expect([0, 1, 2].map((position) => slotFor(byTime, { copyIndex: position, position, styleLabel: 'Bold', copyVersion: null }))).toEqual([
      { variant: '07:00', time: '07:00' },
      { variant: '21:00', time: '21:00' },
      { variant: '07:00', time: '07:00' },
    ]);
    const byHook = { ...defaultBrief(['gancho']), times: ['18:00'] };
    expect(slotFor(byHook, { copyIndex: 1, position: 1, styleLabel: 'Bold', copyVersion: null })).toEqual({ variant: 'Variação', time: '18:00' });
    expect(slotFor(defaultBrief(['design']), { copyIndex: 0, position: 0, styleLabel: 'Bold', copyVersion: 'Controle' })).toEqual({ variant: 'Bold', time: null });
  });

  it('several variables join their parts in the version name', () => {
    const brief = { ...defaultBrief(['gancho', 'horario', 'design']), times: ['08:00', '19:00'] };
    expect(slotFor(brief, { copyIndex: 1, position: 1, styleLabel: 'Bold', copyVersion: null })).toEqual({ variant: 'Variação · Bold · 19:00', time: '19:00' });
  });

  it('with Gancho + Horário, each version goes out at every time, so the two effects can be told apart', () => {
    const next = slotPlanner({ ...defaultBrief(['gancho', 'horario']), times: ['08:00', '19:00'] });
    const variants = [0, 1, 2, 3].map((copyIndex) => next({ copyIndex, styleLabel: 'Bold', copyVersion: null }).variant);
    expect(variants).toEqual(['Controle · 08:00', 'Variação · 08:00', 'Controle · 19:00', 'Variação · 19:00']);
  });

  it('names the parts of a combined version, so the result can be read one variable at a time', () => {
    expect(versionDimensions(['horario', 'gancho', 'cta'])).toEqual([
      { label: 'Gancho + CTA', index: 0, kind: 'copy' },
      { label: 'Horário', index: 1, kind: 'time' },
    ]);
    expect(versionDimensions(['horario'])).toHaveLength(1);
    expect(versionPart('Controle · 08:00', 1)).toBe('08:00');
  });

  it('explains what keeps the test from comparing anything, for every selected variable', () => {
    const brief = { ...defaultBrief(['horario', 'gancho', 'design']), times: ['08:00'] };
    expect(briefProblems(brief, { carousels: 4, styles: 1, copyVersions: ['Controle', 'Controle'] })).toEqual([
      'Pra testar horário, coloque pelo menos 2 horários diferentes.',
      'Pra testar formato, marque pelo menos 2 modelos de slide.',
      'Marque nas copys qual é o Controle e qual é a Variação: o teste precisa das duas.',
    ]);
    expect(briefProblems({ ...defaultBrief([]), name: 'x' }, { carousels: 1, styles: 1, copyVersions: [] })).toEqual(['Escolha o que está testando.']);
  });

  it('saves every variable with its own control and variation; old experiments still read as one variable', () => {
    const brief = { ...defaultBrief(['cta', 'slides']), details: { cta: { control: 'Salva', variation: 'Manda pra alguém' }, slides: { control: '9', variation: '5' } } };
    const saved = experimentFromBrief(brief, 'a');
    expect(saved).toMatchObject({ variable: 'cta', variables: ['cta', 'slides'], control: 'Salva', variation: 'Manda pra alguém' });
    expect(variablesLabel(saved)).toBe('CTA + Número de slides');

    const old = sanitizeExperimentInput({ name: 'Antigo', variable: 'gancho', control: 'A', variation: 'B' } as never);
    expect(old).toMatchObject({ variables: ['gancho'], details: { gancho: { control: 'A', variation: 'B' } } });
  });
});
