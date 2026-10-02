/**
 * "Já separei" format: the user writes the copy, the tool only places it. Two ways to write it:
 *
 * Numbered slides (same as the content prompt output):
 *   Slide 1: texto        or   Slide 1, texto   or   "Slide 1" alone with the text on the next lines
 *   Tema do carrossel: / Título: name of the carousel
 *   Legenda: / Legenda curta sugerida: post caption
 *   Objetivo:, Ideia visual geral:, Instrução visual: and [bracketed notes] are ignored
 *
 * Plain lines:
 *   one line = one slide, `legenda:` lines become the caption
 *
 * In both, `//` breaks a line inside the same slide and a line with only `---` starts a new carousel.
 */
export interface ScriptCarousel {
  /** Carousel name from "Tema do carrossel:" or "Título:", empty when not given. */
  title: string;
  slides: string[];
  caption: string;
}

const CAROUSEL_SEPARATOR = /^\s*---+\s*$/m;
const LINE_BREAK = /\s*\/\/\s*/g;
const SLIDE_HEADER = /^slide\s*\d+\s*(?:\([^)]*\))?\s*(?:[:,.\-–—]\s*)?(.*)$/i;
const LABEL = /^(tema do carrossel|tema|t[íi]tulo do carrossel|t[íi]tulo|legenda curta sugerida|legenda sugerida|legenda|objetivo|ideia visual geral|ideia visual|instru[çc][ãa]o visual|formato da resposta)\s*:\s*(.*)$/i;
const BRACKET_NOTE = /^\[[^\]]*\]$/;

type Target = 'slide' | 'title' | 'caption' | 'ignored';

const LABEL_TARGETS: Record<string, Target> = {
  tema: 'title',
  titulo: 'title',
  legenda: 'caption',
};

export function parseScript(raw: string): ScriptCarousel[] {
  return raw
    .split(CAROUSEL_SEPARATOR)
    .map(parseBlock)
    .filter((carousel) => carousel.slides.length > 0);
}

/** Removes markdown emphasis and wrapping quotes that come along when copying from a chat. */
function clean(line: string): string {
  return line
    .trim()
    .replace(/^[*_#>\s]+|[*_\s]+$/g, '')
    .replace(/\*\*/g, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
}

function labelTarget(label: string): Target {
  const key = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0];
  return LABEL_TARGETS[key] ?? 'ignored';
}

function parseBlock(block: string): ScriptCarousel {
  const lines = block.split(/\r?\n/).map(clean).filter(Boolean);
  return lines.some((line) => SLIDE_HEADER.test(line)) ? parseNumbered(lines) : parsePlain(lines);
}

function parseNumbered(lines: string[]): ScriptCarousel {
  const slides: string[][] = [];
  const title: string[] = [];
  const caption: string[] = [];
  let target: Target = 'ignored';

  const push = (text: string) => {
    if (!text || BRACKET_NOTE.test(text)) return;
    if (target === 'slide') slides[slides.length - 1].push(text);
    else if (target === 'title') title.push(text);
    else if (target === 'caption') caption.push(text);
  };

  for (const line of lines) {
    const header = SLIDE_HEADER.exec(line);
    if (header) {
      slides.push([]);
      target = 'slide';
      push(clean(header[1]));
      continue;
    }
    const label = LABEL.exec(line);
    if (label) {
      target = labelTarget(label[1]);
      push(clean(label[2]));
      continue;
    }
    push(line);
  }

  return {
    title: title.join(' '),
    slides: slides.map((parts) => parts.join('\n').replace(LINE_BREAK, '\n')).filter(Boolean),
    caption: caption.join('\n'),
  };
}

function parsePlain(lines: string[]): ScriptCarousel {
  const slides: string[] = [];
  const caption: string[] = [];
  for (const line of lines) {
    const label = LABEL.exec(line);
    if (label && labelTarget(label[1]) === 'caption') caption.push(label[2]);
    else slides.push(line.replace(LINE_BREAK, '\n'));
  }
  return { title: '', slides, caption: caption.join('\n') };
}

export function scriptStats(carousels: ScriptCarousel[]): { carousels: number; slides: number } {
  return { carousels: carousels.length, slides: carousels.reduce((sum, carousel) => sum + carousel.slides.length, 0) };
}
