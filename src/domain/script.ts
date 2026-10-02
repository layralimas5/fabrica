/**
 * "Já separei" format: the user writes the copy, the tool only places it. Two ways to write it:
 *
 * Numbered slides (same as the content prompt output):
 *   Slide 1: texto   ·   Slide 1, texto   ·   "SLIDE 1 — GANCHO" alone with the text on the next lines
 *   An uppercase label after the number (GANCHO, PRODUTO…) is not text; PRODUTO marks the product slide,
 *   and so does a bracketed note like [INSERIR PRINT DO APP AQUI].
 *   Blank lines inside a slide are kept as paragraph breaks. `---` lines are ignored; a new carousel starts
 *   when the numbering restarts at Slide 1.
 *   Tema do carrossel: / Título: name of the carousel · Legenda: post caption
 *   Objetivo:, Ideia visual geral:, Instrução visual: and other [bracketed notes] are ignored
 *
 * Plain lines:
 *   one line = one slide, `legenda:` lines become the caption, `---` starts a new carousel
 *
 * In both, `//` breaks a line inside the same slide.
 *
 * Many carousels at once: a line like "CARROSSEL 2" or "Carrossel 2: título" starts a new carousel
 * (the text after it becomes its name). Without those headers, restarting at Slide 1 or `---` also works.
 */
export interface ScriptCarousel {
  /** Carousel name from "Tema do carrossel:" or "Título:", empty when not given. */
  title: string;
  slides: string[];
  caption: string;
  /** Slide marked as the product slide, if any. */
  productIndex: number | null;
}

const CAROUSEL_SEPARATOR = /^\s*---+\s*$/;
const LINE_BREAK = /\s*\/\/\s*/g;
const SLIDE_HEADER = /^slide\s*(\d+)\s*(?:\([^)]*\))?\s*(?:[:,.\-–—]\s*)?(.*)$/i;
const LABEL = /^(tema do carrossel|tema|t[íi]tulo do carrossel|t[íi]tulo|legenda curta sugerida|legenda sugerida|legenda|objetivo|ideia visual geral|ideia visual|instru[çc][ãa]o visual|formato da resposta)\s*:\s*(.*)$/i;
const BRACKET_NOTE = /^\[[^\]]*\]$/;
const CAROUSEL_HEADER = /^carrossel\s*\d+\s*(?:[:.,\-–—]\s*(.*))?$/i;
const PRODUCT_NOTE = /print|produto|tela do|screenshot|mockup/i;
const MAX_LABEL_WORDS = 3;

type Target = 'slide' | 'title' | 'caption' | 'ignored';

const LABEL_TARGETS: Record<string, Target> = {
  tema: 'title',
  titulo: 'title',
  legenda: 'caption',
};

/** True when the copy uses "Slide 1, Slide 2…" markers: the user already decided where each slide starts. */
export function hasNumberedSlides(raw: string): boolean {
  return raw.split(/\r?\n/).some((line) => SLIDE_HEADER.test(clean(line)));
}

export function parseScript(raw: string): ScriptCarousel[] {
  const lines = raw.split(/\r?\n/).map(clean);
  const blocks = splitAtCarouselHeaders(lines).flatMap((section) =>
    section.some((line) => SLIDE_HEADER.test(line)) ? splitAtRestart(section) : splitAtSeparator(section),
  );
  return blocks.map(parseBlock).filter((carousel) => carousel.slides.length > 0);
}

/** Raw text of each carousel in a big paste or file, ready to go into one copy box each. */
export function splitCopies(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map(clean);
  return splitAtCarouselHeaders(lines)
    .flatMap((section) => (section.some((line) => SLIDE_HEADER.test(line)) ? splitAtRestart(section) : splitAtSeparator(section)))
    .map((block) => block.join('\n').trim())
    .filter((text) => parseScript(text).length > 0);
}

/** "CARROSSEL 2: título" lines start a new carousel; the title becomes its name. */
function splitAtCarouselHeaders(lines: string[]): string[][] {
  if (!lines.some((line) => CAROUSEL_HEADER.test(line))) return [lines];
  const sections: string[][] = [[]];
  for (const line of lines) {
    const header = CAROUSEL_HEADER.exec(line);
    if (!header) sections[sections.length - 1].push(line);
    else sections.push(header[1]?.trim() ? [`Tema do carrossel: ${header[1].trim()}`] : []);
  }
  return sections;
}

/** Removes markdown emphasis and headings that come along when copying from a chat. Keeps quotes and the words. */
function clean(line: string): string {
  return line.replace(/\*\*|__/g, '').replace(/^\s*(#{1,6}|>)\s+/, '').trim();
}

function splitAtSeparator(lines: string[]): string[][] {
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (CAROUSEL_SEPARATOR.test(line)) blocks.push([]);
    else blocks[blocks.length - 1].push(line);
  }
  return blocks;
}

/** With numbered slides, `---` only separates slides; a carousel ends when "Slide 1" shows up again. */
function splitAtRestart(lines: string[]): string[][] {
  const blocks: string[][] = [[]];
  let seenSlide = false;
  for (const line of lines) {
    if (CAROUSEL_SEPARATOR.test(line)) continue;
    const header = SLIDE_HEADER.exec(line);
    if (header && Number(header[1]) === 1 && seenSlide) blocks.push([]);
    if (header) seenSlide = true;
    blocks[blocks.length - 1].push(line);
  }
  return blocks;
}

function labelTarget(label: string): Target {
  const key = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0];
  return LABEL_TARGETS[key] ?? 'ignored';
}

/** "GANCHO", "PRODUTO", "CTA FINAL": a role tag after the slide number, not slide text. */
function isRoleTag(text: string): boolean {
  return text.length > 0 && text === text.toUpperCase() && /\p{L}/u.test(text) && text.split(/\s+/).length <= MAX_LABEL_WORDS;
}

function parseBlock(lines: string[]): ScriptCarousel {
  return lines.some((line) => SLIDE_HEADER.test(line)) ? parseNumbered(lines) : parsePlain(lines.filter(Boolean));
}

function parseNumbered(lines: string[]): ScriptCarousel {
  const slides: string[][] = [];
  const title: string[] = [];
  const caption: string[] = [];
  let productIndex: number | null = null;
  let target: Target = 'ignored';

  const push = (text: string) => {
    if (BRACKET_NOTE.test(text)) {
      if (target === 'slide' && PRODUCT_NOTE.test(text)) productIndex = slides.length - 1;
      return;
    }
    if (target === 'slide') slides[slides.length - 1].push(text);
    else if (text && target === 'title') title.push(text);
    else if (text && target === 'caption') caption.push(text);
  };

  for (const line of lines) {
    const header = SLIDE_HEADER.exec(line);
    if (header) {
      slides.push([]);
      target = 'slide';
      const rest = header[2].trim();
      if (isRoleTag(rest)) {
        if (/^produto\b/i.test(rest)) productIndex = slides.length - 1;
      } else if (rest) {
        push(rest);
      }
      continue;
    }
    const label = LABEL.exec(line);
    if (label) {
      target = labelTarget(label[1]);
      if (label[2]) push(label[2].trim());
      continue;
    }
    push(line);
  }

  const texts = slides.map(joinParagraphs);
  const kept = texts.map((text, index) => ({ text, index })).filter(({ text }) => text);
  const productPosition = productIndex === null ? -1 : kept.findIndex(({ index }) => index === productIndex);
  return {
    title: title.join(' '),
    slides: kept.map(({ text }) => text),
    caption: caption.join('\n'),
    productIndex: productPosition >= 0 ? productPosition : null,
  };
}

/** Joins the lines of one slide, keeping single blank lines as paragraph breaks. */
function joinParagraphs(lines: string[]): string {
  const result: string[] = [];
  for (const line of lines) {
    if (!line && (result.length === 0 || result[result.length - 1] === '')) continue;
    result.push(line.replace(LINE_BREAK, '\n'));
  }
  while (result[result.length - 1] === '') result.pop();
  return result.join('\n');
}

function parsePlain(lines: string[]): ScriptCarousel {
  const slides: string[] = [];
  const caption: string[] = [];
  let title = '';
  for (const line of lines) {
    const label = LABEL.exec(line);
    if (!label) slides.push(line.replace(LINE_BREAK, '\n'));
    else if (labelTarget(label[1]) === 'caption') caption.push(label[2]);
    else if (labelTarget(label[1]) === 'title') title = label[2].trim();
  }
  return { title, slides, caption: caption.join('\n'), productIndex: null };
}

export function scriptStats(carousels: ScriptCarousel[]): { carousels: number; slides: number } {
  return { carousels: carousels.length, slides: carousels.reduce((sum, carousel) => sum + carousel.slides.length, 0) };
}
