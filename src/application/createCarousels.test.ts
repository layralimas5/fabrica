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
    expect(firstTest.map((carousel) => carousel.format)).toEqual(['9:16', '4:5', '4:5']);
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
