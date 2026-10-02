/**
 * "Já separei" format: the user writes the copy, the tool only places it. Two ways to write it:
 *
 * Numbered slides (same as the content prompt output):
 *   Slide 1: texto   ·   Slide 1, texto   ·   "SLIDE 1 — GANCHO" alone with the text on the next lines
 *   An uppercase label after the number (GANCHO, PRODUTO…) is not text. PRODUTO, APP or PRINT marks the
 *   product slide, with or without a number ("SLIDE 6 — APP", "SLIDE - PRODUTO"), and so does a bracketed
 *   note like [INSERIR PRINT DO APP AQUI].
 *   Blank lines inside a slide are kept as paragraph breaks. `---` lines are ignored; a new carousel starts
 *   when the numbering restarts at Slide 1.
 *   Tema do carrossel: / Título: name of the carousel · Legenda: post caption
 *   Objetivo: and Tipo: (or Tipo de carrossel:) set that carousel's objective and type, overriding the screen
 *   Ideia visual geral:, Instrução visual: and other [bracketed notes] are ignored
 *
 * Plain lines:
 *   one line = one slide, `legenda:` lines become the caption, `---` starts a new carousel
 *
 * In both, `//` breaks a line inside the same slide.
 *
 * Many carousels at once: a line like "CARROSSEL 2" or "Carrossel 2: título" starts a new carousel
 * (the text after it becomes its name). Without those headers, restarting at Slide 1 or `---` also works.
 */
import { parseContentType, parseObjective, type ContentType, type Objective } from './content';

export interface ScriptCarousel {
  /** Carousel name from "Tema do carrossel:" or "Título:", empty when not given. */
  title: string;
  slides: string[];
  caption: string;
  /** Slide marked as the product slide, if any. */
  productIndex: number | null;
  /** From an "Objetivo:" line; null keeps what was chosen on the screen. */
  objective: Objective | null;
  /** From a "Tipo:" line; null keeps what was chosen on the screen. */
  contentType: Exclude<ContentType, 'auto'> | null;
}

const CAROUSEL_SEPARATOR = /^\s*---+\s*$/;
const LINE_BREAK = /\s*\/\/\s*/g;
const NUMBERED_SLIDE = /^slide\s*(\d+)\s*(?:\([^)]*\))?\s*(?:[:,.\-–—]\s*)?(.*)$/i;
/** "SLIDE - PRODUTO", "Slide: app": a product slide written without a number. */
const TAGGED_SLIDE = /^slide\s*(?:[:,.\-–—]\s*)?((?:produto|app|aplicativo|print)\s*(?:$|[:,.\-–—].*$))/i;
/** The tag alone or followed by a separator: "APP", "produto: texto". Not "app que eu uso", which is text. */
const PRODUCT_TAG = /^(?:produto|app|aplicativo|print)\s*(?:$|[:,.\-–—]\s*(.*)$)/i;

interface SlideHeader {
  /** Null for a product slide written without a number. */
  number: number | null;
  rest: string;
}

function slideHeader(line: string): SlideHeader | null {
  const numbered = NUMBERED_SLIDE.exec(line);
  if (numbered) return { number: Number(numbered[1]), rest: numbered[2].trim() };
  const tagged = TAGGED_SLIDE.exec(line);
  return tagged ? { number: null, rest: tagged[1].trim() } : null;
}

const isSlideHeader = (line: string) => slideHeader(line) !== null;
const LABEL = /^(tema do carrossel|tema|t[íi]tulo do carrossel|t[íi]tulo|legenda curta sugerida|legenda sugerida|legenda|objetivo|tipo de carrossel|tipo|ideia visual geral|ideia visual|instru[çc][ãa]o visual|formato da resposta)\s*:\s*(.*)$/i;
const BRACKET_NOTE = /^\[[^\]]*\]$/;
const CAROUSEL_HEADER = /^carrossel\s*\d+\s*(?:[:.,\-–—]\s*(.*))?$/i;
const PRODUCT_NOTE = /print|produto|tela do|screenshot|mockup/i;
const MAX_LABEL_WORDS = 3;

type Target = 'slide' | 'title' | 'caption' | 'objective' | 'contentType' | 'ignored';

const LABEL_TARGETS: Record<string, Target> = {
  tema: 'title',
  titulo: 'title',
  legenda: 'caption',
  objetivo: 'objective',
  tipo: 'contentType',
};

/** True when the copy uses "Slide 1, Slide 2…" markers: the user already decided where each slide starts. */
export function hasNumberedSlides(raw: string): boolean {
  return raw.split(/\r?\n/).some((line) => isSlideHeader(clean(line)));
}

export function parseScript(raw: string): ScriptCarousel[] {
  const lines = raw.split(/\r?\n/).map(clean);
  const blocks = splitAtCarouselHeaders(lines).flatMap((section) =>
    section.some(isSlideHeader) ? splitAtRestart(section) : splitAtSeparator(section),
  );
  return blocks.map(parseBlock).filter((carousel) => carousel.slides.length > 0);
}

/** Raw text of each carousel in a big paste or file, ready to go into one copy box each. */
export function splitCopies(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map(clean);
  return splitAtCarouselHeaders(lines)
    .flatMap((section) => (section.some(isSlideHeader) ? splitAtRestart(section) : splitAtSeparator(section)))
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
    const header = slideHeader(line);
    if (header?.number === 1 && seenSlide) blocks.push([]);
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
  return lines.some(isSlideHeader) ? parseNumbered(lines) : parsePlain(lines.filter(Boolean));
}

function parseNumbered(lines: string[]): ScriptCarousel {
  const slides: string[][] = [];
  const title: string[] = [];
  const caption: string[] = [];
  let productIndex: number | null = null;
  let objective: Objective | null = null;
  let contentType: Exclude<ContentType, 'auto'> | null = null;
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
    const header = slideHeader(line);
    if (header) {
      slides.push([]);
      target = 'slide';
      const productTag = PRODUCT_TAG.exec(header.rest);
      if (productTag) {
        productIndex = slides.length - 1;
        if (productTag[1]?.trim()) push(productTag[1].trim());
      } else if (header.rest && !isRoleTag(header.rest)) {
        push(header.rest);
      }
      continue;
    }
    const label = LABEL.exec(line);
    if (label) {
      target = labelTarget(label[1]);
      // Objective and type are one-line values: the lines after them go back to being ignored.
      if (target === 'objective') objective = parseObjective(label[2]) ?? objective;
      else if (target === 'contentType') contentType = parseContentType(label[2]) ?? contentType;
      else if (label[2]) push(label[2].trim());
      if (target === 'objective' || target === 'contentType') target = 'ignored';
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
    objective,
    contentType,
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
  let objective: Objective | null = null;
  let contentType: Exclude<ContentType, 'auto'> | null = null;
  for (const line of lines) {
    const label = LABEL.exec(line);
    const target = label ? labelTarget(label[1]) : 'slide';
    if (!label) slides.push(line.replace(LINE_BREAK, '\n'));
    else if (target === 'caption') caption.push(label[2]);
    else if (target === 'title') title = label[2].trim();
    else if (target === 'objective') objective = parseObjective(label[2]) ?? objective;
    else if (target === 'contentType') contentType = parseContentType(label[2]) ?? contentType;
  }
  return { title, slides, caption: caption.join('\n'), productIndex: null, objective, contentType };
}

export function scriptStats(carousels: ScriptCarousel[]): { carousels: number; slides: number } {
  return { carousels: carousels.length, slides: carousels.reduce((sum, carousel) => sum + carousel.slides.length, 0) };
}
