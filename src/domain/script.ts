/**
 * "Meu texto" format: the user writes the copy, the tool only places it.
 * - one line = one slide
 * - `//` breaks a line inside the same slide
 * - a line with only `---` starts a new carousel
 * - lines starting with `legenda:` become the post caption
 */
export interface ScriptCarousel {
  slides: string[];
  caption: string;
}

const CAROUSEL_SEPARATOR = /^\s*---+\s*$/m;
const CAPTION_PREFIX = /^legenda\s*:\s*/i;
const LINE_BREAK = /\s*\/\/\s*/g;

export function parseScript(raw: string): ScriptCarousel[] {
  return raw
    .split(CAROUSEL_SEPARATOR)
    .map(parseBlock)
    .filter((carousel) => carousel.slides.length > 0);
}

function parseBlock(block: string): ScriptCarousel {
  const slides: string[] = [];
  const caption: string[] = [];
  for (const line of block.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    if (CAPTION_PREFIX.test(line)) caption.push(line.replace(CAPTION_PREFIX, ''));
    else slides.push(line.replace(LINE_BREAK, '\n'));
  }
  return { slides, caption: caption.join('\n') };
}

export function scriptStats(carousels: ScriptCarousel[]): { carousels: number; slides: number } {
  return { carousels: carousels.length, slides: carousels.reduce((sum, carousel) => sum + carousel.slides.length, 0) };
}
