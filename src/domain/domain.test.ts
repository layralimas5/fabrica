import { describe, expect, it } from 'vitest';
import { HeuristicAi } from '../infra/ai/heuristicAi';
import type { DraftRequest } from './aiContract';
import type { Asset } from './asset';
import { composeSlides } from './composeCarousel';
import { productSlideIndex } from './content';
import { matchImages } from './imageMatching';
import { assignLayouts, LAYOUTS } from './layouts';
import { limitWords, splitSentences, wordCount } from './text';

const COPY = `Você não precisa de mais motivação.
Motivação funciona quando tudo está indo bem. O problema aparece nos dias ruins.
Quem depende de motivação para quando a vontade some.
Disciplina é decidir antes, quando você ainda está calmo.
Comece com uma rotina pequena, de dez minutos por dia.
Deixe o ambiente pronto na noite anterior.
No fim, constância vence intensidade.`;

const asset = (id: string, tags: string[], kind: Asset['kind'] = 'foto'): Asset => ({
  id,
  name: `${id}.jpg`,
  folder: 'Lifestyle',
  kind,
  tags,
  width: 1080,
  height: 1350,
  mimeType: 'image/jpeg',
  createdAt: '2026-10-01T00:00:00Z',
});

/** Tags that relate to every sentence of COPY, so each slide has a photo that fits. */
const COPY_TAGS = ['motivação', 'problema', 'vontade', 'disciplina', 'rotina', 'ambiente', 'constância'];

const request = (overrides: Partial<DraftRequest> = {}): DraftRequest => ({
  copy: COPY,
  contentType: 'educativo',
  objective: 'salvamento',
  visualStyle: 'minimalista',
  slideCount: null,
  brand: { name: 'Momentumm', handle: '@momentumm', voice: '', visualStyle: 'minimalista' },
  product: null,
  assets: [],
  ...overrides,
});

describe('text helpers', () => {
  it('splits sentences and drops list markers', () => {
    expect(splitSentences('- primeiro item\n2) segundo. Terceiro!')).toEqual(['primeiro item', 'segundo.', 'Terceiro!']);
  });

  it('limits words preferring sentence boundaries', () => {
    expect(limitWords('Frase curta. Outra frase bem mais longa que passa do limite.', 4)).toBe('Frase curta.');
    expect(wordCount(limitWords('uma duas tres quatro cinco seis', 3).replace('…', ''))).toBe(3);
  });
});

describe('HeuristicAi.draftCarousel', () => {
  const ai = new HeuristicAi();

  it('opens with the hook, ends with an objective CTA and never invents content', async () => {
    const draft = await ai.draftCarousel(request());
    expect(draft.slides[0].title).toBe('Você não precisa de mais motivação.');
    expect(draft.slides.at(-1)?.role).toBe('cta');
    expect(draft.slides.at(-1)?.title).toContain('Salva');
    const middleText = draft.slides.slice(1, -1).map((slide) => `${slide.title} ${slide.body ?? ''}`).join(' ');
    for (const sentence of splitSentences(COPY).slice(1)) expect(middleText).toContain(sentence);
  });

  it('respects an explicit slide count', async () => {
    const draft = await ai.draftCarousel(request({ slideCount: 5 }));
    expect(draft.slides).toHaveLength(5);
  });

  it('shrinks when the copy is shorter than the requested count', async () => {
    const draft = await ai.draftCarousel(request({ copy: 'Gancho forte. Uma ideia só.', slideCount: 10 }));
    expect(draft.slides).toHaveLength(3);
  });

  it('generates distinct hooks different from the original', async () => {
    const hooks = await ai.generateHooks({ hook: 'Você não precisa de mais motivação.', copy: COPY, brand: request().brand, count: 5 });
    expect(hooks).toHaveLength(5);
    expect(new Set(hooks).size).toBe(5);
    expect(hooks).not.toContain('Você não precisa de mais motivação.');
  });
});

describe('composeSlides', () => {
  it('enforces readability, appends a CTA and keeps layout rhythm', async () => {
    const draft = await new HeuristicAi().draftCarousel(request());
    draft.slides[0].title = 'Um gancho longo demais que passa muito do limite de palavras permitido para o primeiro slide do carrossel';
    draft.slides.pop();

    const slides = composeSlides(draft, { objective: 'compartilhamento', assets: [] });
    expect(wordCount(slides[0].title.replace('…', ''))).toBeLessThanOrEqual(14);
    expect(slides.at(-1)?.role).toBe('cta');
    for (let i = 1; i < slides.length - 1; i++) expect(slides[i].layout).not.toBe(slides[i - 1].layout);
    expect(slides.every((slide) => !LAYOUTS[slide.layout].needsImage)).toBe(true);
  });

  it('only keeps asset ids that exist in the library', async () => {
    const draft = await new HeuristicAi().draftCarousel(request());
    draft.slides[0].assetId = 'nao-existe';
    const slides = composeSlides(draft, { objective: 'salvamento', assets: [asset('a1', ['motivação'])] });
    expect(slides.some((slide) => slide.assetId === 'nao-existe')).toBe(false);
    expect(slides[0].assetId).toBe('a1');
  });
});

describe('post style', () => {
  it('puts an image on every content slide and uses only post layouts', async () => {
    const draft = await new HeuristicAi().draftCarousel(request({ visualStyle: 'post', slideCount: 5 }));
    const assets = ['a', 'b', 'c', 'd', 'e'].map((id) => asset(id, COPY_TAGS));
    const slides = composeSlides(draft, { objective: 'engajamento', assets, visualStyle: 'post' });
    expect(slides.slice(0, -1).every((slide) => slide.layout === 'post_image' && slide.assetId)).toBe(true);
    expect(slides.at(-1)?.layout).toBe('post_text');
  });
});

describe('tiktok style', () => {
  it('uses one sentence per slide and a full photo on every slide, CTA included', async () => {
    const draft = await new HeuristicAi().draftCarousel(request({ visualStyle: 'tiktok' }));
    const assets = Array.from({ length: 12 }, (_, i) => asset(`p${i}`, [...COPY_TAGS, 'salva', 'voltar']));
    const slides = composeSlides(draft, { objective: 'salvamento', assets, visualStyle: 'tiktok' });
    expect(slides.length).toBe(splitSentences(COPY).length + 1);
    expect(slides.every((slide) => slide.layout === 'native_photo' && slide.assetId)).toBe(true);
    expect(slides.slice(1, -1).every((slide) => slide.body === null)).toBe(true);
  });
});

describe('matchImages', () => {
  it('never puts a photo that has nothing to do with the slide', () => {
    const assets = [asset('beach', ['praia', 'mar', 'férias'])];
    expect(matchImages(['Foco no trabalho todo dia', 'Férias na praia'], assets, () => 0)).toEqual([null, 'beach']);
  });

  it('prefers images whose tags match the slide and avoids repeats', () => {
    const assets = [asset('desk', ['trabalho', 'notebook', 'foco']), asset('gym', ['treino', 'academia']), asset('logo', ['marca'], 'logo')];
    const result = matchImages(['Foco no trabalho todo dia', 'Treino na academia', null], assets, () => 0);
    expect(result).toEqual(['desk', 'gym', null]);
  });
});

describe('assignLayouts', () => {
  it('falls back to text layouts when there is no image', () => {
    const layouts = assignLayouts([{ role: 'hook', hasBullets: false, hasImage: false, suggested: 'image_full_quote' }]);
    expect(layouts[0]).toBe('big_statement');
  });
});

describe('product slide', () => {
  const product = { name: 'Momentumm', pitch: 'Conecta metas a ações do dia. Deixa o progresso visível. Terceira frase.', hasImage: true };

  it('places the product right after the solution on pain themes and in the middle on method themes', () => {
    expect(productSlideIndex(['situation', 'problem', 'insight', 'solution', 'conclusion'], 'late')).toBe(4);
    expect(productSlideIndex(['situation', 'problem', 'conclusion'], 'late')).toBe(2);
    expect(productSlideIndex(['point', 'point', 'point', 'point'], 'middle')).toBe(2);
  });

  it('adds exactly one product slide from the pitch, before the CTA', async () => {
    const draft = await new HeuristicAi().draftCarousel(request({ contentType: 'dor', product }));
    const products = draft.slides.filter((slide) => slide.role === 'product');
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe('Momentumm');
    expect(products[0].body).toBe('Conecta metas a ações do dia. Deixa o progresso visível.');
    expect(draft.slides.indexOf(products[0])).toBeLessThan(draft.slides.length - 1);
    expect(draft.caption).toContain('Você não precisa de mais motivação.');
  });

  it('keeps the requested slide count when a product is included', async () => {
    const draft = await new HeuristicAi().draftCarousel(request({ product, slideCount: 7 }));
    expect(draft.slides).toHaveLength(7);
  });

  it('uses the product screenshot on the product slide only', () => {
    const screenshot = asset('print', ['app', 'tela']);
    const library = [screenshot, asset('p1', ['rotina']), asset('p2', ['rotina'])];
    const slides = composeSlides(
      {
        title: 't',
        caption: '',
        slides: [
          { role: 'hook', title: 'Gancho', subtitle: null, body: null, bullets: [], assetId: null, layout: null, wantsImage: true },
          { role: 'product', title: 'Momentumm', subtitle: null, body: null, bullets: [], assetId: null, layout: null, wantsImage: true },
          { role: 'solution', title: 'tela do app', subtitle: null, body: null, bullets: [], assetId: null, layout: null, wantsImage: true },
        ],
      },
      { objective: 'salvamento', assets: library, productAssetId: 'print' },
    );
    expect(slides[1].assetId).toBe('print');
    expect(slides.filter((slide) => slide.assetId === 'print')).toHaveLength(1);
    expect(LAYOUTS[slides[1].layout].needsImage).toBe(true);
  });
});

describe('HeuristicAi.matchImages', () => {
  it('returns null for slides without a related photo', async () => {
    const assets = [{ id: 'cafe', name: 'cafe.jpg', folder: 'Geral', kind: 'foto', tags: ['café', 'manhã'] }];
    const result = await new HeuristicAi().matchImages({ slides: [{ text: 'Meu café da manhã' }, { text: 'Treino pesado' }], assets });
    expect(result).toEqual(['cafe', null]);
  });
});
