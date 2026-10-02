import { describe, expect, it } from 'vitest';
import { hasNumberedSlides, parseScript, splitCopies } from './script';

/** Real copy pasted from a chat: bold markdown, role tags, `---` between slides, a product note. */
const CHAT_COPY = `**SLIDE 1 — GANCHO**

Eu parei de organizar minha vida por tarefas.

**Comecei a organizar assim:**

---

**SLIDE 2**

Porque ter uma lista cheia de coisas para fazer
não significa que você está evoluindo.

Você pode passar o dia inteiro ocupado…

e continuar exatamente no mesmo lugar.

---

**SLIDE 3**

O problema é quando tudo vira tarefa:

responder mensagem
fazer “só mais uma coisinha”

**Mas avançou em quê?**

---

**SLIDE 6 — PRODUTO**

Foi exatamente essa lógica que eu levei para o Momentumm.

**[INSERIR PRINT DO MOMENTUMM AQUI]**

Em vez de ter tarefas soltas, eu consigo visualizar o objetivo.

---

**SLIDE 7**

E passa a ser:

**“isso me deixou mais perto da vida que eu quero.”**`;

describe('parseScript with copy pasted from a chat', () => {
  const carousels = parseScript(CHAT_COPY);
  const [carousel] = carousels;

  it('keeps one carousel: `---` between numbered slides does not start a new one', () => {
    expect(carousels).toHaveLength(1);
    expect(carousel.slides).toHaveLength(5);
  });

  it('drops the slide label and role tags, keeps paragraphs and quotes', () => {
    expect(carousel.slides[0]).toBe('Eu parei de organizar minha vida por tarefas.\n\nComecei a organizar assim:');
    expect(carousel.slides[2]).toBe('O problema é quando tudo vira tarefa:\n\nresponder mensagem\nfazer “só mais uma coisinha”\n\nMas avançou em quê?');
    expect(carousel.slides[4]).toBe('E passa a ser:\n\n“isso me deixou mais perto da vida que eu quero.”');
    expect(carousel.slides.join(' ')).not.toMatch(/SLIDE|GANCHO|PRODUTO|INSERIR/);
  });

  it('marks the PRODUTO slide as the product slide', () => {
    expect(carousel.productIndex).toBe(3);
    expect(carousel.slides[3]).toBe('Foi exatamente essa lógica que eu levei para o Momentumm.\n\nEm vez de ter tarefas soltas, eu consigo visualizar o objetivo.');
  });

  it('detects numbered copy so AI mode keeps the slides as written', () => {
    expect(hasNumberedSlides(CHAT_COPY)).toBe(true);
    expect(hasNumberedSlides('uma copy solta sem numeração')).toBe(false);
  });

  it('starts a new carousel when the numbering restarts', () => {
    expect(parseScript('Slide 1, a\nSlide 2, b\n---\nSlide 1, c')).toHaveLength(2);
  });
});

describe('parseScript mass production', () => {
  const BATCH = [
    'CARROSSEL 1: Organizar por objetivo',
    'Slide 1, eu parei de organizar minha vida por tarefas',
    'Slide 2, comecei pelo lugar onde quero chegar',
    'Legenda: salva pra lembrar',
    '',
    '**CARROSSEL 2 — Constância**',
    'Slide 1, ninguém te conta isso sobre constância',
    'Slide 2, você não precisa de motivação',
    '',
    'Carrossel 3',
    'rotina boa sobrevive ao dia ruim',
    'comece pela menor ação possível',
  ].join('\n');

  it('splits at CARROSSEL headers and uses the text after them as the name', () => {
    const carousels = parseScript(BATCH);
    expect(carousels.map((carousel) => carousel.title)).toEqual(['Organizar por objetivo', 'Constância', '']);
    expect(carousels.map((carousel) => carousel.slides.length)).toEqual([2, 2, 2]);
    expect(carousels[0].caption).toBe('salva pra lembrar');
    expect(carousels[2].slides).toEqual(['rotina boa sobrevive ao dia ruim', 'comece pela menor ação possível']);
  });
});

describe('splitCopies', () => {
  it('cuts a batch into one copy per carousel, keeping each name', () => {
    const copies = splitCopies('CARROSSEL 1: Um\nSlide 1, a\nSlide 2, b\n\nCARROSSEL 2: Dois\nSlide 1, c');
    expect(copies).toHaveLength(2);
    expect(parseScript(copies[0])[0]).toMatchObject({ title: 'Um', slides: ['a', 'b'] });
    expect(parseScript(copies[1])[0]).toMatchObject({ title: 'Dois', slides: ['c'] });
  });
});

describe('parseScript product slide markers', () => {
  it('accepts APP and PRINT after the number', () => {
    expect(parseScript('Slide 1, gancho\nSLIDE 2 — APP\nO app mostra o progresso.')[0].productIndex).toBe(1);
    expect(parseScript('Slide 1, gancho\nSlide 2 - print: veja como fica')[0]).toMatchObject({ productIndex: 1, slides: ['gancho', 'veja como fica'] });
  });

  it('accepts a product slide without a number', () => {
    const [carousel] = parseScript('Slide 1, gancho\nSLIDE - PRODUTO\nFoi essa lógica que eu levei pro app.\nSlide 3, fechamento');
    expect(carousel.slides).toEqual(['gancho', 'Foi essa lógica que eu levei pro app.', 'fechamento']);
    expect(carousel.productIndex).toBe(1);
  });

  it('does not take text that starts with "app" as a marker', () => {
    const [carousel] = parseScript('Slide 1, gancho\nSlide 2, app que eu uso todo dia');
    expect(carousel.productIndex).toBeNull();
    expect(carousel.slides[1]).toBe('app que eu uso todo dia');
  });
});

