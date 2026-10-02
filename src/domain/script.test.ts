import { describe, expect, it } from 'vitest';
import { hasNumberedSlides, parseScript } from './script';

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
