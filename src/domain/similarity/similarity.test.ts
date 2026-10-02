import { describe, expect, it } from 'vitest';
import { alertLevel, compareContents, DEFAULT_SIMILARITY_SETTINGS, findSimilar, sanitizeSimilaritySettings, similarityBand, type ComparableContent } from './similarity';

const content = (overrides: Partial<ComparableContent> & Pick<ComparableContent, 'id' | 'slides'>): ComparableContent => ({
  accountId: 'a',
  hook: overrides.slides[0] ?? '',
  theme: '',
  narrative: ['gancho', 'problema', 'explicação', 'solução', 'CTA'],
  day: null,
  originId: null,
  winning: false,
  ...overrides,
});

const original = content({
  id: 'orig',
  theme: 'disciplina',
  day: '2026-09-26',
  winning: true,
  slides: ['Você não precisa de mais disciplina.', 'Você começa a semana cheia de planos e para na quarta.', 'O problema é não saber pra onde está indo.', 'Comece pelo motivo.', 'Salva pra lembrar.'],
});

describe('similarity', () => {
  it('scores a near copy as very similar', () => {
    const copy = content({ ...original, id: 'copy', day: '2026-10-02', winning: false });
    expect(compareContents(copy, original).score).toBeGreaterThanOrEqual(90);
    expect(similarityBand(compareContents(copy, original).score)).toBe('muito');
  });

  it('scores an unrelated content as different', () => {
    const other = content({ id: 'x', theme: 'alimentação', narrative: ['gancho', 'lista', 'CTA'], slides: ['3 lanches práticos pra levar no trabalho.', 'Iogurte com fruta.', 'Comenta o seu favorito.'] });
    expect(compareContents(other, original).score).toBeLessThan(30);
  });

  it('warns about a repeat of the same account, louder when it is recent', () => {
    const repeat = content({ ...original, id: 'rep', day: '2026-10-02', winning: false, slides: [...original.slides.slice(0, 4), 'Salva pra lembrar amanhã.'] });
    const [match] = findSimilar(repeat, [original, { ...original, id: 'other-account', accountId: 'b' }], '2026-10-02', DEFAULT_SIMILARITY_SETTINGS);
    expect(match.other.id).toBe('orig');
    expect(match.kind).toBe('repeticao');
    expect(match.ageDays).toBe(6);
    expect(match.level).toBe('alto');
  });

  it('reads a new take on a winner as a variation, not a repeat', () => {
    const variation = content({
      id: 'var',
      theme: 'disciplina',
      originId: 'orig',
      day: '2026-10-02',
      slides: ['Seu problema talvez nunca tenha sido falta de disciplina.', 'Rotina sem direção cansa.', 'Por isso você desiste.', 'Defina um motivo antes da meta.', 'Manda pra quem precisa.'],
    });
    const matches = findSimilar(variation, [original], '2026-10-02', { ...DEFAULT_SIMILARITY_SETTINGS, threshold: 20 });
    expect(matches[0].kind).toBe('variacao');
  });

  it('turns age into an alert level using configurable windows', () => {
    expect(alertLevel(2, DEFAULT_SIMILARITY_SETTINGS)).toBe('alto');
    expect(alertLevel(15, DEFAULT_SIMILARITY_SETTINGS)).toBe('medio');
    expect(alertLevel(60, DEFAULT_SIMILARITY_SETTINGS)).toBe('baixo');
    expect(alertLevel(120, DEFAULT_SIMILARITY_SETTINGS)).toBe('reciclavel');
    expect(sanitizeSimilaritySettings({ highDays: 10, mediumDays: 5 }).mediumDays).toBe(11);
  });
});
