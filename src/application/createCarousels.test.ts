import { describe, expect, it } from 'vitest';
import type { Asset } from '../domain/asset';
import { defaultBrandKit, type BrandKit } from '../domain/brandKit';
import type { Carousel, CarouselInput } from '../domain/carousel';
import { emptyMetrics, engagementRate, performanceBy, winnerIndex } from '../domain/metrics';
import { parseScript } from '../domain/script';
import { HeuristicAi } from '../infra/ai/heuristicAi';
import { createCarousels, type CreateRequest } from './createCarousels';
import type { Services } from './ports';

function fakeServices(): Services & { saved: Carousel[] } {
  const saved: Carousel[] = [];
  const unused = () => Promise.reject(new Error('not used'));
  return {
    saved,
    auth: {} as Services['auth'],
    brandKits: {} as Services['brandKits'],
    assets: { list: unused, upload: unused, update: unused, renameFolder: unused, remove: unused, fetchBlob: unused },
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
  format: '4:5',
  brand,
  library: photos,
  mode: 'manual',
  text: SCRIPT,
  contentType: 'auto',
  objective: 'salvamento',
  slideCount: 'auto',
  folders: [],
  styles: ['minimalista'],
  addCta: false,
  includeProduct: false,
  shade: { style: 'bottom', intensity: 0.5 },
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
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', text: copy, contentType: 'dor', includeProduct: true }));
    const slides = services.saved[0].slides;
    const product = slides.filter((slide) => slide.role === 'product');
    expect(product).toHaveLength(1);
    expect(product[0].assetId).toBe('a0');
    expect(slides.filter((slide) => slide.assetId === 'a0')).toHaveLength(1);
    expect(services.saved[0].caption).not.toBe('');
  });

  it('leaves the product out when the toggle is off', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', text: copy, includeProduct: false }));
    expect(services.saved[0].slides.some((slide) => slide.role === 'product')).toBe(false);
  });
});

describe('createCarousels product image picked at creation', () => {
  it('uses the image picked on the create screen instead of the brand kit one', async () => {
    const services = fakeServices();
    const withProduct: BrandKit = { ...brand, product: { name: 'Momentumm', pitch: 'Deixa o progresso visível.', imageAssetId: 'a0' } };
    const copy = 'Você não precisa de mais motivação. Motivação some nos dias ruins. Disciplina é decidir antes. Comece pequeno.';
    await createCarousels(services, request({ brand: withProduct, mode: 'ai', text: copy, includeProduct: true, productImageAssetId: 'a5' }));
    const slides = services.saved[0].slides;
    expect(slides.find((slide) => slide.role === 'product')?.assetId).toBe('a5');
    expect(slides.filter((slide) => slide.assetId === 'a5')).toHaveLength(1);
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
    await createCarousels(services, request({ library: [beach], text: 'treino pesado na academia\nférias na praia', styles: ['tiktok'] }));
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
    await createCarousels(services, request({ text: 'Slide 1, primeira frase\nSlide 2, segunda frase', folders: ['Pinterest'], styles: ['tiktok'] }));
    const slides = services.saved[0].slides;
    expect(slides.every((slide) => slide.assetId && ['a0', 'a1', 'a2'].includes(slide.assetId))).toBe(true);
    expect(new Set(slides.map((slide) => slide.assetId)).size).toBe(slides.length);
  });

  it('keeps unmatched slides text-only when every folder is selected', async () => {
    const services = fakeServices();
    await createCarousels(services, request({ text: 'Slide 1, primeira frase', folders: [], styles: ['tiktok'] }));
    expect(services.saved[0].slides[0].assetId).toBeNull();
  });
});

