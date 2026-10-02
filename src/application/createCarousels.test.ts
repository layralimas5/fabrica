import { describe, expect, it } from 'vitest';
import type { Asset } from '../domain/asset';
import { defaultBrandKit, type BrandKit } from '../domain/brandKit';
import type { Carousel, CarouselInput } from '../domain/carousel';
import { emptyMetrics, engagementRate, performanceBy, winnerIndex } from '../domain/metrics';
import { parseScript } from '../domain/script';
import type { Experiment } from '../domain/experiments/experiment';
import { defaultBrief } from '../domain/experiments/brief';
import { HeuristicAi } from '../infra/ai/heuristicAi';
import { createCarousels, type CreateRequest } from './createCarousels';
import type { Services } from './ports';

function fakeServices(): Services & { saved: Carousel[]; experimentsSaved: Experiment[] } {
  const saved: Carousel[] = [];
  const experimentsSaved: Experiment[] = [];
  const unused = () => Promise.reject(new Error('not used'));
  return {
    saved,
    experimentsSaved,
    auth: {} as Services['auth'],
    brandKits: {} as Services['brandKits'],
    assets: { list: unused, upload: unused, update: unused, renameFolder: unused, remove: unused, fetchBlob: unused },
    accounts: {} as Services['accounts'],
    presets: {} as Services['presets'],
    contentRecords: {} as Services['contentRecords'],
    experiments: {
      list: async () => experimentsSaved,
      create: async (input) => {
        const experiment: Experiment = { ...input, id: `exp-${experimentsSaved.length + 1}`, createdAt: '', updatedAt: '' };
        experimentsSaved.push(experiment);
        return experiment;
      },
      update: unused,
      remove: unused,
    } as Services['experiments'],
    calendarEntries: {} as Services['calendarEntries'],
    backup: null,
    ai: new HeuristicAi(),
    carousels: {
      list: async () => saved,
      get: async (id) => saved.find((item) => item.id === id) ?? null,
      create: async (input: CarouselInput) => {
        const carousel: Carousel = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        saved.push(carousel);
        return carousel;
      },
      update: unused,
      remove: unused,
    },
  };
}

const brand: BrandKit = { ...defaultBrandKit({ name: 'Ella' }), id: 'b1', createdAt: '', updatedAt: '' };
const photos: Asset[] = Array.from({ length: 6 }, (_, i) => ({
  id: `a${i}`,
  name: `${i}.jpg`,
  folder: i < 3 ? 'Pinterest' : 'Outros',
  kind: 'foto',
  tags: ['rotina'],
  width: 1080,
  height: 1350,
  mimeType: 'image/jpeg',
  createdAt: '',
}));

const SCRIPT = `ninguém te conta isso sobre disciplina
você não precisa de motivação // precisa de rotina
legenda: salva pra lembrar #rotina
---
3 hábitos que mudaram minha manhã
acordar sem celular`;

const request = (overrides: Partial<CreateRequest> = {}): CreateRequest => ({
  platform: 'instagram',
  accountId: null,
  format: '4:5',
  brand,
  library: photos,
  mode: 'manual',
  texts: [SCRIPT],
  contentType: 'auto',
  objective: 'salvamento',
  slideCount: 'auto',
  folders: [],
  styles: ['minimalista'],
  addCta: false,
  includeProduct: false,
  shade: { style: 'bottom', intensity: 0.5 },
  postWithImages: true,
  textStyle: { fontScale: 1, textWidth: 1, lineHeight: 1 },
  project: '',
  folder: '',
  schedule: null,
  ...overrides,
});

describe('parseScript', () => {
  it('splits carousels, slides, line breaks and captions', () => {
    const [first, second] = parseScript(SCRIPT);
    expect(first.slides).toEqual(['ninguém te conta isso sobre disciplina', 'você não precisa de motivação\nprecisa de rotina']);
    expect(first.caption).toBe('salva pra lembrar #rotina');
    expect(second.slides).toHaveLength(2);
  });
});

describe('createCarousels', () => {
  it('manual mode keeps the text word for word and creates one carousel per block', async () => {
    const services = fakeServices();
    const { carousels, experimentIds } = await createCarousels(services, request());
    expect(carousels).toHaveLength(2);
    expect(experimentIds).toHaveLength(0);
    expect(carousels[0].slides.map((slide) => slide.title)).toEqual(['ninguém te conta isso sobre disciplina', 'você não precisa de motivação\nprecisa de rotina']);
    expect(carousels[0].caption).toBe('salva pra lembrar #rotina');
  });

  it('each copy keeps its own objective and type; a line in the script wins over the box', async () => {
    const services = fakeServices();
    const scripted = 'Objetivo: Conversão\nTipo: dor\nSlide 1, Você trava na quarta.\nSlide 2, Comece pelo motivo.';
    const { carousels } = await createCarousels(
      services,
      request({
        texts: ['Slide 1, Um gancho.\nSlide 2, Fim.', '', 'Slide 1, Outro.\nSlide 2, Fim.', scripted],
        copySettings: [
          { objective: 'compartilhamento', contentType: 'contrarian' },
          { objective: null, contentType: null },
          { objective: null, contentType: null },
          { objective: 'educacao', contentType: 'lista' },
        ],
        addCta: true,
      }),
    );
    expect(carousels.map((carousel) => [carousel.source.objective, carousel.source.contentType])).toEqual([
      ['compartilhamento', 'contrarian'],
      ['salvamento', 'auto'],
      ['conversao', 'dor'],
    ]);
    // The CTA follows each carousel's own objective.
    expect(carousels[0].slides.at(-1)?.title).toBe('Manda pra alguém que precisa ler isso hoje.');
    expect(carousels[2].slides.map((slide) => slide.title)).not.toContain('Conversão');
  });

  it('a copy may have its own slide model outside a format test', async () => {
    const services = fakeServices();
    const { carousels } = await createCarousels(
      services,
      request({ texts: ['Slide 1, Um.\nSlide 2, Fim.', 'Slide 1, Dois.\nSlide 2, Fim.'], copySettings: [{ objective: null, contentType: null, style: 'bold' }, { objective: null, contentType: null }] }),
    );
    expect(carousels.map((carousel) => carousel.source.visualStyle)).toEqual(['bold', 'minimalista']);
  });

  it('only adds a CTA when asked', async () => {
    const services = fakeServices();
    const { carousels } = await createCarousels(services, request({ addCta: true }));
    expect(carousels[0].slides.at(-1)?.role).toBe('cta');
  });

  it('a format test creates one variant per style sharing the same photos', async () => {
    const services = fakeServices();
    const { carousels, experimentIds } = await createCarousels(services, request({ styles: ['tiktok', 'post', 'minimalista'], folders: ['Pinterest'] }));
    expect(experimentIds).toHaveLength(2);
    expect(carousels).toHaveLength(6);
    const firstTest = carousels.filter((carousel) => carousel.experiment?.id === experimentIds[0]);
    expect(firstTest.map((carousel) => carousel.format)).toEqual(['4:5', '4:5', '4:5']);
    expect(firstTest[1].slides[0].assetId).toBe(firstTest[0].slides[0].assetId);
    expect(carousels.flatMap((carousel) => carousel.slides).every((slide) => !slide.assetId || ['a0', 'a1', 'a2'].includes(slide.assetId))).toBe(true);
  });
});

describe('metrics', () => {
  const metrics = (views: number, likes: number, saves = 0) => ({ ...emptyMetrics(), views, likes, saves });

  it('computes engagement and picks a single winner', () => {
    expect(engagementRate(metrics(1000, 40, 10))).toBeCloseTo(0.05);
    expect(winnerIndex([metrics(1000, 40), metrics(1000, 80), null], 'engagement')).toBe(1);
    expect(winnerIndex([metrics(1000, 40), null], 'engagement')).toBeNull();
    expect(winnerIndex([metrics(1000, 40), metrics(1000, 40)], 'engagement')).toBeNull();
  });

  it('ranks groups by average score', () => {
    const ranking = performanceBy(
      [
        { key: 'tiktok', metrics: metrics(1000, 100) },
        { key: 'tiktok', metrics: metrics(1000, 50) },
        { key: 'post', metrics: metrics(1000, 30) },
        { key: 'post', metrics: null },
      ],
      'engagement',
    );
    expect(ranking.map((row) => row.key)).toEqual(['tiktok', 'post']);
    expect(ranking[0].samples).toBe(2);
  });
});

describe('createCarousels with a product', () => {
  const withProduct: BrandKit = { ...brand, product: { name: 'Momentumm', pitch: 'Deixa o progresso visível.', imageAssetId: 'a0' } };
  const copy = 'Você não precisa de mais motivação. Motivação some nos dias ruins. Disciplina é decidir antes. Comece pequeno. Constância vence.';

  it('shows the product screenshot in one AI slide and keeps it out of the other slides', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', texts: [`${copy}\n[PRINT DO APP]`], contentType: 'dor', includeProduct: true }));
    const slides = services.saved[0].slides;
    const product = slides.filter((slide) => slide.role === 'product');
    expect(product).toHaveLength(1);
    expect(product[0].assetId).toBe('a0');
    expect(slides.filter((slide) => slide.assetId === 'a0')).toHaveLength(1);
    expect(services.saved[0].caption).not.toBe('');
  });

  it('as a cut-out, the product slide gets a library photo behind and the print as a card', async () => {
    const services = fakeServices();
    const script = 'Slide 1, Você trava na quarta.\nSlide 2 — APP\nO Momentumm mostra o porquê.\nSlide 3, Comece pelo motivo.';
    await createCarousels(services, request({ brand: withProduct, texts: [script], includeProduct: true, productDisplay: 'card', folders: ['Pinterest'], styles: ['tiktok'] }));
    const product = services.saved[0].slides.find((slide) => slide.role === 'product');
    expect(product?.card).toEqual({ assetId: 'a0', position: 'top-left', size: 0.48 });
    expect(product?.assetId).not.toBeNull();
    expect(product?.assetId).not.toBe('a0');
    expect(product?.layout).toBe('native_photo');
    expect(services.saved[0].slides.filter((slide) => slide.card)).toHaveLength(1);
  });

  it('leaves the product out when the copy marks no APP or PRODUTO slide', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', texts: [copy], contentType: 'dor', includeProduct: true }));
    const slides = services.saved[0].slides;
    expect(slides.some((slide) => slide.role === 'product')).toBe(false);
    expect(slides.some((slide) => slide.assetId === 'a0')).toBe(false);
  });

  it('leaves the product out when the toggle is off', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', texts: [copy], includeProduct: false }));
    expect(services.saved[0].slides.some((slide) => slide.role === 'product')).toBe(false);
  });
});

describe('createCarousels product image picked at creation', () => {
  it('uses the image picked on the create screen instead of the brand kit one', async () => {
    const services = fakeServices();
    const withProduct: BrandKit = { ...brand, product: { name: 'Momentumm', pitch: 'Deixa o progresso visível.', imageAssetId: 'a0' } };
    const copy = 'Você não precisa de mais motivação. Motivação some nos dias ruins. Disciplina é decidir antes. Comece pequeno.';
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', texts: [`${copy}\n[PRINT DO APP]`], includeProduct: true, productImageAssetId: 'a5' }));
    const slides = services.saved[0].slides;
    expect(slides.find((slide) => slide.role === 'product')?.assetId).toBe('a5');
    expect(slides.filter((slide) => slide.assetId === 'a5')).toHaveLength(1);
  });
});

describe('createCarousels app image per copy', () => {
  const withProduct: BrandKit = { ...brand, product: { name: 'Momentumm', pitch: 'Deixa o progresso visível.', imageAssetId: 'a0' } };
  const appScript = (hook: string) => `Slide 1, ${hook}
Slide 2 — APP
O Momentumm mostra o porquê.
Slide 3, Comece pelo motivo.`;

  it('each copy shows its own app image in the APP slide and the image stays out of the photo pool', async () => {
    const services = fakeServices();
    await createCarousels(
      services,
      request({
        brand: withProduct,
        texts: [appScript('Você trava na quarta.'), appScript('Seu dia some no celular.')],
        includeProduct: true,
        copySettings: [
          { objective: null, contentType: null, productImageAssetId: 'a4' },
          { objective: null, contentType: null, productImageAssetId: 'a5' },
        ],
      }),
    );
    const [first, second] = services.saved;
    expect(first.slides.find((slide) => slide.role === 'product')?.assetId).toBe('a4');
    expect(second.slides.find((slide) => slide.role === 'product')?.assetId).toBe('a5');
    const others = services.saved.flatMap((carousel) => carousel.slides.filter((slide) => slide.role !== 'product'));
    expect(others.some((slide) => slide.assetId === 'a4' || slide.assetId === 'a5')).toBe(false);
  });

  it('a copy without its own image falls back to the batch image', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ brand: withProduct, texts: [appScript('Você trava na quarta.')], includeProduct: true, copySettings: [] }));
    expect(services.saved[0].slides.find((slide) => slide.role === 'product')?.assetId).toBe('a0');
  });

  it('uses the copy image even when the brand has no product set', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: [appScript('Você trava na quarta.')], includeProduct: false, copySettings: [{ objective: null, contentType: null, productImageAssetId: 'a3' }] }));
    expect(services.saved[0].slides.find((slide) => slide.role === 'product')?.assetId).toBe('a3');
  });

  it('refuses to create an APP slide without the app image instead of filling it with a random photo', async () => {
    const services = fakeServices();
    await expect(createCarousels(services, request({ texts: ['Slide 1, oi', appScript('Você trava na quarta.')], includeProduct: false }))).rejects.toThrow('A copy 2 tem slide do app');
    expect(services.saved).toHaveLength(0);
  });
});

describe('createCarousels proportion', () => {
  it('uses the chosen proportion whatever the visual style', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ platform: 'instagram', format: '1:1', styles: ['minimalista', 'tiktok'] }));
    expect(services.saved.every((carousel) => carousel.format === '1:1')).toBe(true);
  });
});

describe('createCarousels shade', () => {
  it('saves the chosen shade on every carousel, format test variants included', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ styles: ['minimalista', 'tiktok'], shade: { style: 'vignette', intensity: 0.6 } }));
    expect(services.saved.length).toBeGreaterThan(1);
    expect(services.saved.every((carousel) => carousel.source.shade?.style === 'vignette' && carousel.source.shade.intensity === 0.6)).toBe(true);
  });
});

describe('createCarousels photo context', () => {
  it('leaves a slide without photo when no library photo relates to it', async () => {
    const services = fakeServices();
    const beach: Asset = { ...photos[0], id: 'beach', tags: ['praia', 'mar'] };
    await createCarousels(services, request({ library: [beach], texts: ['treino pesado na academia\nférias na praia'], styles: ['tiktok'] }));
    const slides = services.saved[0].slides;
    expect(slides[0].assetId).toBeNull();
    expect(slides[1].assetId).toBe('beach');
  });
});

describe('parseScript numbered slides', () => {
  it('reads "Slide 1, texto" lines as slides without the label', () => {
    const [carousel] = parseScript('Slide 1, ninguém te conta isso\nSlide 2: você não precisa de motivação\nslide 3 - comece pequeno');
    expect(carousel.slides).toEqual(['ninguém te conta isso', 'você não precisa de motivação', 'comece pequeno']);
  });

  it('reads the content prompt output: title, slides with text below, caption, ignored notes', () => {
    const raw = [
      'Tema do carrossel:',
      'Rotina que sobrevive ao dia ruim',
      'Objetivo:',
      'gerar identificação',
      'Slide 1:',
      '**Se sua rotina só funciona nos dias bons, ela não funciona.**',
      'Slide 2:',
      'Você planeja tudo no domingo.',
      'Na quarta, desandou.',
      'Slide 6:',
      'O Momentumm mostra o que você já fez.',
      'Instrução visual: [Inserir imagem/tela/foto do produto aqui]',
      'Slide 9 (opcional):',
      'Salva pra lembrar.',
      'Legenda curta sugerida:',
      'Constância é recomeçar sem culpa.',
      'Ideia visual geral:',
      'fundo claro, muito respiro',
    ].join('\n');
    const [carousel] = parseScript(raw);
    expect(carousel.title).toBe('Rotina que sobrevive ao dia ruim');
    expect(carousel.slides).toEqual([
      'Se sua rotina só funciona nos dias bons, ela não funciona.',
      'Você planeja tudo no domingo.\nNa quarta, desandou.',
      'O Momentumm mostra o que você já fez.',
      'Salva pra lembrar.',
    ]);
    expect(carousel.caption).toBe('Constância é recomeçar sem culpa.');
  });
});

describe('createCarousels folder as photo context', () => {
  it('fills every slide from the chosen folder when no tag matches the text', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: ['Slide 1, primeira frase\nSlide 2, segunda frase'], folders: ['Pinterest'], styles: ['tiktok'] }));
    const slides = services.saved[0].slides;
    expect(slides.every((slide) => slide.assetId && ['a0', 'a1', 'a2'].includes(slide.assetId))).toBe(true);
    expect(new Set(slides.map((slide) => slide.assetId)).size).toBe(slides.length);
  });

  it('fills unmatched slides from the whole library when every folder is selected', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: ['Slide 1, primeira frase\nSlide 2, segunda frase'], folders: [], styles: ['tiktok'] }));
    expect(services.saved[0].slides.every((slide) => slide.assetId !== null)).toBe(true);
  });

  it('never repeats a photo in the same carousel, even when the library runs out', async () => {
    const services = fakeServices();
    const slides = Array.from({ length: 5 }, (_, i) => `Slide ${i + 1}, rotina da manhã ${i + 1}`).join('\n');
    await createCarousels(services, request({ texts: [slides], folders: ['Pinterest'], styles: ['tiktok'] }));
    const used = services.saved[0].slides.map((slide) => slide.assetId).filter(Boolean);
    expect(used).toHaveLength(3);
    expect(new Set(used).size).toBe(used.length);
  });

  it('keeps app prints and mockups out of the regular slides', async () => {
    const services = fakeServices();
    const prints: Asset[] = [
      { ...photos[0], id: 'print', name: 'tela.png', folder: 'Produto', kind: 'screenshot' },
      { ...photos[1], id: 'mock', name: 'mock.png', folder: 'Outros', kind: 'mockup' },
      { ...photos[2], id: 'named', name: 'slide-06.png', folder: 'Mockups Momentumm', kind: 'foto' },
      { ...photos[3], id: 'tagged', name: 'IMG_2201.jpg', folder: 'Pinterest', kind: 'foto', tags: ['app', 'tela'] },
    ];
    const slides = Array.from({ length: 8 }, (_, i) => `Slide ${i + 1}, rotina ${i + 1}`).join('\n');
    await createCarousels(services, request({ library: [...photos, ...prints], texts: [slides], folders: [], styles: ['tiktok'] }));
    const used = services.saved[0].slides.map((slide) => slide.assetId);
    expect(used).not.toContain('print');
    expect(used).not.toContain('mock');
    expect(used).not.toContain('named');
    expect(used).not.toContain('tagged');
  });

  it('keeps app images out even when their folder is the one picked for the photos', async () => {
    const services = fakeServices();
    const library: Asset[] = [...photos, { ...photos[0], id: 'print', name: 'tela.png', folder: 'Pinterest', kind: 'screenshot' }];
    const slides = Array.from({ length: 4 }, (_, i) => `Slide ${i + 1}, rotina ${i + 1}`).join('\n');
    await createCarousels(services, request({ library, texts: [slides], folders: ['Pinterest'], styles: ['tiktok'] }));
    expect(services.saved[0].slides.map((slide) => slide.assetId)).not.toContain('print');
  });

  it('with the copy sent by Lay, only the SLIDE — APP block gets the app print', async () => {
    const services = fakeServices();
    const copy = [
      'Slide 1', 'Em vez de criar 10 metas para 2027, faça isso.', '',
      'Slide 2', 'Escolha 3 coisas que realmente mudariam sua vida.', '',
      'Slide 3', 'Agora transforme cada uma em um resultado claro.', '',
      'Slide 4', 'Depois divida cada objetivo em marcos menores.', '',
      'SLIDE — APP', '', 'Agora coloque esse objetivo em um sistema que mostre:', '',
      '[Inserir tela do Momentumm mostrando objetivo + marcos + percentual de progresso.]', '',
      'Slide 6', 'Agora vem a parte mais importante:', '',
      'Slide 7', 'Porque uma meta só começa a existir de verdade quando vira execução.', '',
      'Slide 8', 'Não planeje apenas o seu 2027.', '',
      'Slide 9', 'Já tem uma meta?',
    ].join('\n');
    const library: Asset[] = [...photos, { ...photos[0], id: 'mockup', name: 'slide-03.png', folder: 'Produto', kind: 'foto' }];
    await createCarousels(services, request({ library, texts: [copy], styles: ['tiktok'], copySettings: [{ objective: null, contentType: null, productImageAssetId: 'app-print' }] }));
    const slides = services.saved[0].slides;
    expect(slides).toHaveLength(9);
    expect(slides.map((slide) => slide.role === 'product')).toEqual([false, false, false, false, true, false, false, false, false]);
    expect(slides[4].assetId).toBe('app-print');
    expect(slides.filter((slide) => slide.assetId === 'app-print' || slide.assetId === 'mockup')).toHaveLength(1);
  });
});

describe('createCarousels planning', () => {
  it('files carousels in the project and folder and spreads them over days', async () => {
    const services = fakeServices();
    const text = 'um\n---\ndois\n---\ntres';
    await createCarousels(services, request({ texts: [text], project: ' Aura ', folder: 'Outubro', schedule: { startDate: '2026-10-05', perDay: 2 } }));
    expect(services.saved.map((carousel) => carousel.scheduledFor)).toEqual(['2026-10-05', '2026-10-05', '2026-10-06']);
    expect(services.saved.every((carousel) => carousel.project === 'Aura' && carousel.folder === 'Outubro')).toBe(true);
  });

  it('format test variants share the same day', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: ['um'], styles: ['minimalista', 'tiktok'], schedule: { startDate: '2026-10-05', perDay: 1 } }));
    expect(services.saved.map((carousel) => carousel.scheduledFor)).toEqual(['2026-10-05', '2026-10-05']);
  });

  it('post model with text only has no photos', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: ['um\ndois'], styles: ['post'], folders: ['Pinterest'], postWithImages: false }));
    const slides = services.saved[0].slides;
    expect(slides.every((slide) => slide.assetId === null && slide.layout === 'post_text')).toBe(true);
  });
});

describe('createCarousels several copy boxes', () => {
  it('makes one carousel per loose copy in AI mode and keeps written scripts as written', async () => {
    const services = fakeServices();
    await createCarousels(
      services,
      request({
        mode: 'ai',
        texts: ['Motivação some nos dias ruins. Disciplina é decidir antes. Comece pequeno.', '', 'Slide 1, já separado\nSlide 2, pela Lay'],
      }),
    );
    expect(services.saved).toHaveLength(2);
    expect(services.saved[0].source.copyMode).toBe('ai');
    expect(services.saved[1].slides.map((slide) => slide.title)).toEqual(['já separado', 'pela Lay']);
  });
});

describe('createCarousels photos across copies', () => {
  const folderPhotos = (count: number): Asset[] => Array.from({ length: count }, (_, i) => ({ ...photos[0], id: `f${i}`, folder: 'Ella', tags: [] }));
  const threeCopies = ['Slide 1, um\nSlide 2, dois', 'Slide 1, tres\nSlide 2, quatro', 'Slide 1, cinco\nSlide 2, seis'];

  it('gives each copy different photos while the folder has unused ones', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ library: folderPhotos(6), texts: threeCopies, folders: ['Ella'], styles: ['tiktok'] }));
    const ids = services.saved.flatMap((carousel) => carousel.slides.map((slide) => slide.assetId));
    expect(new Set(ids).size).toBe(6);
  });

  it('repeats only when the folder runs out, spreading the repeats evenly', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ library: folderPhotos(4), texts: threeCopies, folders: ['Ella'], styles: ['tiktok'] }));
    const counts = new Map<string, number>();
    for (const carousel of services.saved) for (const slide of carousel.slides) if (slide.assetId) counts.set(slide.assetId, (counts.get(slide.assetId) ?? 0) + 1);
    expect(counts.size).toBe(4);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    for (const carousel of services.saved) expect(new Set(carousel.slides.map((slide) => slide.assetId)).size).toBe(2);
  });
});

describe('createCarousels text style', () => {
  it('applies the chosen text size, width and line spacing to every slide', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ textStyle: { fontScale: 0.7, textWidth: 0.6, lineHeight: 1.3 } }));
    for (const carousel of services.saved) {
      expect(carousel.slides.every((slide) => slide.style.fontScale === 0.7 && slide.style.textWidth === 0.6 && slide.style.lineHeight === 1.3)).toBe(true);
    }
  });
});

describe('createCarousels photos across weeks', () => {
  it('a new batch starts with photos the account did not post recently', async () => {
    const services = fakeServices();
    const library: Asset[] = Array.from({ length: 4 }, (_, i) => ({ ...photos[0], id: `w${i}`, folder: 'Ella', tags: [] }));
    await createCarousels(services, request({ library, texts: ['Slide 1, um\nSlide 2, dois'], folders: ['Ella'], styles: ['tiktok'] }));
    const firstWeek = new Set(services.saved[0].slides.map((slide) => slide.assetId));
    await createCarousels(services, request({ library, texts: ['Slide 1, tres\nSlide 2, quatro'], folders: ['Ella'], styles: ['tiktok'] }));
    const secondWeek = services.saved[1].slides.map((slide) => slide.assetId);
    expect(secondWeek.some((id) => firstWeek.has(id))).toBe(false);
  });
});


describe('createCarousels with a ficha do teste', () => {
  const four = ['um', 'dois', 'três', 'quatro'].map((word) => `Slide 1, ${word}\nSlide 2, mais ${word}`);

  it('a time test makes one experiment and the carousels take turns over the times', async () => {
    const services = fakeServices();
    const brief = { ...defaultBrief('horario'), times: ['19:00', '08:00'] };
    const result = await createCarousels(services, request({ texts: four, test: { brief, copyVersions: [] } }));
    expect(services.experimentsSaved).toHaveLength(1);
    expect(services.experimentsSaved[0]).toMatchObject({ variable: 'horario', times: ['08:00', '19:00'] });
    expect(result.experimentIds).toEqual(['exp-1']);
    expect(services.saved.map((carousel) => carousel.source.scheduledTime)).toEqual(['08:00', '19:00', '08:00', '19:00']);
    expect(services.saved.map((carousel) => carousel.experiment?.variant)).toEqual(['08:00', '19:00', '08:00', '19:00']);
    expect(services.saved.every((carousel) => carousel.experiment?.id === 'exp-1')).toBe(true);
  });

  it('a format test with a ficha puts every copy in the same experiment, one version per style, all at the same time', async () => {
    const services = fakeServices();
    const brief = { ...defaultBrief('design'), times: ['12:30'] };
    await createCarousels(services, request({ texts: four.slice(0, 2), styles: ['minimalista', 'tiktok'], test: { brief, copyVersions: [] } }));
    expect(services.experimentsSaved).toHaveLength(1);
    expect(services.saved).toHaveLength(4);
    expect(new Set(services.saved.map((carousel) => carousel.experiment?.id))).toEqual(new Set(['exp-1']));
    expect(new Set(services.saved.map((carousel) => carousel.experiment?.variant)).size).toBe(2);
    expect(services.saved.every((carousel) => carousel.source.scheduledTime === '12:30')).toBe(true);
  });

  it('other variables use the version marked on each copy', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ texts: four.slice(0, 3), test: { brief: defaultBrief('gancho'), copyVersions: ['Variação', 'Controle', null] } }));
    expect(services.saved.map((carousel) => carousel.experiment?.variant)).toEqual(['Variação', 'Controle', 'Controle']);
    expect(services.saved.every((carousel) => !carousel.source.scheduledTime)).toBe(true);
  });

  it('refuses a test with a single version and creates nothing', async () => {
    const services = fakeServices();
    const run = createCarousels(services, request({ texts: four.slice(0, 2), test: { brief: defaultBrief('gancho'), copyVersions: ['Controle', 'Controle'] } }));
    await expect(run).rejects.toThrow('pelo menos 2 versões');
    expect(services.experimentsSaved).toHaveLength(0);
    expect(services.saved).toHaveLength(0);
  });

  it('refuses a time test with fewer carousels than times', async () => {
    const services = fakeServices();
    const run = createCarousels(services, request({ texts: four.slice(0, 1), test: { brief: { ...defaultBrief('horario'), times: ['08:00', '12:00', '19:00'] }, copyVersions: [] } }));
    await expect(run).rejects.toThrow('crie pelo menos 3 carrosséis');
  });
});
