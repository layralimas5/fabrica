import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeSlides } from './composeCarousel';
import { parseScript } from './script';

const thirteen = Array.from({ length: 12 }, (_, index) => `Slide ${index + 1}\nTexto do slide ${index + 1}.`).join('\n\n');
const WITH_CTA = `${thirteen}

Slide 13 — CTA
Antes de terminar seu dia, responde:
qual ação realmente fez você avançar hoje?

Legenda: Qual foi a sua?`;

describe('slide labels in written copy', () => {
  it('keeps a 13th CTA slide as the CTA, with its text and role', () => {
    const [carousel] = parseScript(WITH_CTA);
    expect(carousel.slides).toHaveLength(13);
    expect(carousel.slides[12]).toBe('Antes de terminar seu dia, responde:\nqual ação realmente fez você avançar hoje?');
    expect(carousel.roles[12]).toBe('cta');
    expect(carousel.caption).toBe('Qual foi a sua?');
  });

  it('reads labels in any case, with design notes or with the text on the same line', () => {
    const [carousel] = parseScript(`Slide 1 — Capa (fundo escuro)
Você não precisa de mais disciplina.

Slide 2 — Cta
Comenta ROTINA.

Slide 3 — CTA: Salva pra ver amanhã.

Slide 4: Você começa a semana cheia de planos.`);
    expect(carousel.slides).toEqual(['Você não precisa de mais disciplina.', 'Comenta ROTINA.', 'Salva pra ver amanhã.', 'Você começa a semana cheia de planos.']);
    expect(carousel.roles).toEqual(['hook', 'cta', 'cta', null]);
  });

  it('keeps a short line in parentheses as text when nothing follows it', () => {
    const [carousel] = parseScript('Slide 1: Você não está atrasada (eu juro)\nSlide 2: Só começou.');
    expect(carousel.slides[0]).toBe('Você não está atrasada (eu juro)');
  });

  it('turns a design spec file into slide text only', () => {
    const file = readFileSync(new URL('./__fixtures__/portfolio-spec.md', import.meta.url), 'utf8');
    const [carousel] = parseScript(file);
    expect(carousel.slides).toHaveLength(4);
    expect(carousel.slides[0]).toBe('Projetos entregues\nO cliente chega com uma frase. Eu volto com um site.\nQuatro pedidos reais.');
    expect(carousel.slides.join(' ')).not.toMatch(/Capa|fundo|Visual|Eyebrow|Referência|lesquim|\|/);
    expect(carousel.title).toBe('');
    expect(carousel.roles).toEqual(['hook', null, null, 'cta']);
    expect(carousel.slides[3]).toBe('Me conta o que você precisa.\nChama no direct');
  });
});

describe('composing written copy', () => {
  it('keeps every written slide up to 20 and does not add a CTA over the written one', () => {
    const [carousel] = parseScript(WITH_CTA);
    const slides = composeSlides(
      { title: '', caption: '', slides: carousel.slides.map((text, index) => ({ role: carousel.roles[index] ?? 'point', title: text, subtitle: null, body: null, bullets: [], assetId: null, layout: null, wantsImage: false })) },
      { objective: 'engajamento', assets: [], visualStyle: 'minimalista', preserveText: true, addCta: true },
    );
    expect(slides).toHaveLength(13);
    expect(slides[12].role).toBe('cta');
    expect(slides[12].title).toContain('qual ação realmente fez você avançar hoje?');
  });
});
