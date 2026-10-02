import { describe, expect, it } from 'vitest';
import { parseScript } from '../script';
import { analyzeDna, classifyHook } from './dna';
import { applyFilters, EMPTY_FILTERS, periodRange, sortRecords } from './filters';
import { generateInsights } from './insights';
import { emptyPerformance, emptyRecordInput, sanitizeRecordInput, type ContentRecord, type PerformanceMetrics } from './record';
import { buildRemixPrompt, defaultRemixRequest, remixProblem, scriptsToCopies } from './remix';
import { contentScore, PRESET_WEIGHTS, scoreBand, scoreReference, suggestWinnerTypes } from './score';

let sequence = 0;
function record(overrides: Partial<Omit<ContentRecord, 'metrics'>> & { metrics?: Partial<PerformanceMetrics> } = {}): ContentRecord {
  sequence += 1;
  const { metrics, ...rest } = overrides;
  return {
    ...emptyRecordInput(),
    id: `r${sequence}`,
    title: `Conteúdo ${sequence}`,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...rest,
    metrics: { ...emptyPerformance(), ...metrics },
  };
}

const WINNER_SCRIPT = [
  { role: 'hook' as const, text: 'Você não tem problema de disciplina.' },
  { role: 'point' as const, text: 'Você começa a semana cheia de planos e para na quarta.' },
  { role: 'point' as const, text: 'O problema real é não saber pra onde está indo.' },
  { role: 'point' as const, text: 'Isso acontece porque tarefa sem objetivo não tem peso.' },
  { role: 'point' as const, text: 'Na verdade, constância nasce de um motivo claro.' },
  { role: 'product' as const, text: 'Foi por isso que eu criei o Momentumm.' },
  { role: 'point' as const, text: 'Salva pra lembrar quando a semana apertar.' },
];

describe('classifyHook', () => {
  it.each([
    ['Você não tem problema de disciplina.', 'confronto'],
    ['3 erros que travam sua rotina', 'erro_comum'],
    ['5 hábitos que mudaram minha manhã', 'lista'],
    ['Ninguém te conta isso sobre constância.', 'curiosidade'],
    ['Talvez você não seja procrastinador.', 'contrarian'],
    ['Quando eu tinha 20 anos, eu não sabia disso.', 'historia'],
    ['Cuidado com a rotina perfeita.', 'alerta'],
    ['Eu parei de organizar minha vida por tarefas.', 'confissao'],
    ['Por que você sempre recomeça na segunda?', 'pergunta'],
  ])('"%s" → %s', (hook, expected) => {
    expect(classifyHook(hook)).toBe(expected);
  });
});

describe('analyzeDna', () => {
  const dna = analyzeDna({ beats: WINNER_SCRIPT, caption: '', productName: 'Momentumm' });

  it('reads the structure, not the words', () => {
    expect(dna).not.toBeNull();
    expect(dna?.hookType).toBe('confronto');
    expect(dna?.slideCount).toBe(7);
    expect(dna?.beats[0].purpose).toBe('Gancho forte / quebra de crença');
    expect(dna?.narrative).toEqual(['gancho', 'identificação', 'problema', 'explicação', 'quebra de crença', 'produto', 'CTA']);
  });

  it('finds the product near the end, an indirect CTA and a fast rhythm', () => {
    expect(dna?.productPlacement).toBe('final');
    expect(dna?.cta).toBe('indireto');
    expect(dna?.textDensity).toBe('baixa');
    expect(dna?.rhythm).toBe('rapido');
    expect(dna?.retention).toContain('virada de chave no meio');
  });

  it('returns null for an empty script', () => {
    expect(analyzeDna({ beats: [{ role: null, text: '  ' }] })).toBeNull();
  });
});

describe('sanitizeRecordInput', () => {
  it('keeps unmeasured metrics as null and cleans bad values', () => {
    const clean = sanitizeRecordInput({ metrics: { ...emptyPerformance(), views: 38400.7, saves: -3, revenue: 199.999 }, theme: '  procrastinação  ', pillar: 'inexistente' as never });
    expect(clean.metrics.views).toBe(38400);
    expect(clean.metrics.saves).toBeNull();
    expect(clean.metrics.revenue).toBe(200);
    expect(clean.metrics.signups).toBeNull();
    expect(clean.theme).toBe('procrastinação');
    expect(clean.pillar).toBeNull();
  });
});

describe('content score', () => {
  const viral = record({ metrics: { views: 100_000, signups: 10 } });
  const converter = record({ metrics: { views: 12_000, signups: 80 } });
  const reference = scoreReference([viral.metrics, converter.metrics]);

  it('does not treat the most viewed content as the best for conversion', () => {
    const viralScore = contentScore(viral.metrics, reference, PRESET_WEIGHTS.conversao);
    const converterScore = contentScore(converter.metrics, reference, PRESET_WEIGHTS.conversao);
    expect(converterScore!.value).toBeGreaterThan(viralScore!.value);
  });

  it('favors reach on the awareness profile', () => {
    const viralScore = contentScore(viral.metrics, reference, PRESET_WEIGHTS.alcance);
    const converterScore = contentScore(converter.metrics, reference, PRESET_WEIGHTS.alcance);
    expect(viralScore!.value).toBeGreaterThan(converterScore!.value);
  });

  it('needs at least two measured metrics', () => {
    expect(contentScore({ ...emptyPerformance(), views: 500 }, reference, PRESET_WEIGHTS.equilibrado)).toBeNull();
  });

  it('bands the score', () => {
    expect(scoreBand(89)).toBe('excelente');
    expect(scoreBand(67)).toBe('bom');
    expect(scoreBand(20)).toBe('abaixo');
  });
});

describe('suggestWinnerTypes', () => {
  it('suggests business types from any sign-up or sale', () => {
    expect(suggestWinnerTypes({ ...emptyPerformance(), signups: 3, sales: 1 }, [])).toEqual(['aquisicao', 'conversao']);
  });

  it('needs a comparison base to call something a reach winner', () => {
    const metrics = { ...emptyPerformance(), views: 40_000 };
    expect(suggestWinnerTypes(metrics, [])).toEqual([]);
    const others = [5_000, 6_000, 7_000].map((views) => ({ ...emptyPerformance(), views }));
    expect(suggestWinnerTypes(metrics, others)).toEqual(['alcance']);
  });
});

describe('filters and sorting', () => {
  const library = [
    record({ platform: 'tiktok', accountLabel: 'TikTok 2', format: 'carrossel', hookType: 'confronto', theme: 'Procrastinação', publishedAt: '2026-09-25', metrics: { views: 38_400, signups: 32 } }),
    record({ platform: 'tiktok', accountLabel: 'TikTok 2', format: 'carrossel', hookType: 'confronto', theme: 'Procrastinação', publishedAt: '2026-07-01', metrics: { views: 90_000, signups: 5 } }),
    record({ platform: 'instagram', format: 'ugc', hookType: 'dor', theme: 'Hábitos', productPresence: 'demo_direta', publishedAt: '2026-09-28', metrics: { views: 5_000, shares: 300 } }),
    record({ platform: 'tiktok', accountLabel: 'TikTok 2', format: 'pov', hookType: 'confronto', theme: 'Disciplina', publishedAt: '2026-09-20', script: [{ role: null, text: 'Disciplina não é força de vontade.' }] }),
  ];

  it('combines every filter', () => {
    const result = applyFilters(
      library,
      { ...EMPTY_FILTERS, platforms: ['tiktok'], accounts: ['label:tiktok 2'], period: '30', formats: ['carrossel'], hookTypes: ['confronto'], themes: ['procrastinação'] },
      '2026-10-02',
    );
    expect(result.map((item) => item.id)).toEqual([library[0].id]);
  });

  it('"produto aparece" includes demonstrations', () => {
    expect(applyFilters(library, { ...EMPTY_FILTERS, products: ['aparece'] }, '2026-10-02')).toEqual([library[2]]);
  });

  it('searches the copy too, ignoring accents', () => {
    expect(applyFilters(library, { ...EMPTY_FILTERS, query: 'forca de vontade' }, '2026-10-02')).toEqual([library[3]]);
  });

  it('computes the last N days including today', () => {
    expect(periodRange({ period: '7', from: '', to: '' }, '2026-10-02')).toEqual({ from: '2026-09-26', to: '2026-10-02' });
  });

  it('sorts by the chosen metric and leaves unmeasured contents last', () => {
    const bySignups = sortRecords(library, 'signups', () => null).map((item) => item.id);
    expect(bySignups.slice(0, 2)).toEqual([library[0].id, library[1].id]);
    const byViews = sortRecords(library, 'views', () => null).map((item) => item.id);
    expect(byViews[0]).toBe(library[1].id);
    expect(byViews[3]).toBe(library[3].id);
  });
});

describe('generateInsights', () => {
  it('says nothing without enough data', () => {
    expect(generateInsights([record({ hookType: 'confronto', metrics: { views: 1000, saves: 100 } })], () => '')).toEqual([]);
  });

  it('finds a pattern backed by at least 3 contents on each side', () => {
    const confronto = [1, 2, 3].map(() => record({ hookType: 'confronto', metrics: { views: 1000, saves: 120 } }));
    const others = [1, 2, 3].map(() => record({ hookType: 'curiosidade', metrics: { views: 1000, saves: 40 } }));
    const insights = generateInsights([...confronto, ...others], () => '');
    expect(insights.some((insight) => insight.text === 'Ganchos de confronto têm 3x mais salvamentos por visualização que os outros ganchos.')).toBe(true);
  });
});

describe('remix', () => {
  const winner = record({ theme: 'procrastinação', format: 'carrossel', script: WINNER_SCRIPT });
  const dna = analyzeDna({ beats: WINNER_SCRIPT, productName: 'Momentumm' })!;

  it('asks for what is missing', () => {
    expect(remixProblem(defaultRemixRequest('model'))).toBe('Informe o novo tema.');
    expect(remixProblem({ ...defaultRemixRequest('family'), themes: ['metas'] })).toContain('pelo menos 2');
    expect(remixProblem({ ...defaultRemixRequest('model'), themes: ['Hábitos sem objetivos'] })).toBeNull();
  });

  it('briefs the mechanism and the Fábrica answer format', () => {
    const prompt = buildRemixPrompt(winner, dna, { ...defaultRemixRequest('model'), themes: ['Hábitos sem objetivos'] }, null);
    expect(prompt).toContain('Copie o mecanismo que fez ele funcionar.');
    expect(prompt).toContain('Crie 1 conteúdo novo sobre o tema: "Hábitos sem objetivos"');
    expect(prompt).toContain('Número de slides: exatamente 7.');
    expect(prompt).toContain('Slide 6: Mostra o produto');
    expect(prompt).toContain('CARROSSEL 1: título curto');
  });

  it('turns Claude answers into scripts the create screen parses, with the product slide marked', () => {
    const copies = scriptsToCopies([
      { title: 'Hábitos sem objetivos', caption: 'Salva.', slides: [{ text: 'Criar mais hábitos pode estar te atrasando.', product: false }, { text: 'O Momentumm\nmostra o porquê.', product: true }] },
    ]);
    const [parsed] = parseScript(copies[0]);
    expect(parsed.title).toBe('Hábitos sem objetivos');
    expect(parsed.slides).toEqual(['Criar mais hábitos pode estar te atrasando.', 'O Momentumm\nmostra o porquê.']);
    expect(parsed.productIndex).toBe(1);
    expect(parsed.caption).toBe('Salva.');
  });
});
