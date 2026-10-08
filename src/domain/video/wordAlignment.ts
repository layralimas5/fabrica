/** Matches the words written in the caption with the words the voice reported speaking, to time each one. */

export interface SpokenWord {
  text: string;
  /** Seconds from the start of the sentence audio. */
  start: number;
  end: number;
}

export interface WordSpan {
  start: number;
  end: number;
}

const LOOKAHEAD = 3;

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Spoken weight of a word: longer words take longer, punctuation adds the pause the voice makes. */
export function wordWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  const pause = /[.!?…]$/.test(word) ? 3 : /[,;:]$/.test(word) ? 2 : 0;
  return Math.max(letters, 1) + 1 + pause;
}

/** Spreads words over a time window proportionally to their weight. */
function spread(words: string[], from: number, to: number): WordSpan[] {
  const total = words.reduce((sum, word) => sum + wordWeight(word), 0) || 1;
  let cursor = from;
  return words.map((word) => {
    const length = ((to - from) * wordWeight(word)) / total;
    const span = { start: cursor, end: cursor + length };
    cursor += length;
    return span;
  });
}

/**
 * Time of every caption word. Words the voice reported get their real time; the others
 * (a symbol, a number read differently) share the gap between their timed neighbours.
 */
export function alignWords(captionWords: string[], spoken: SpokenWord[], duration: number): WordSpan[] {
  const spans: (WordSpan | null)[] = captionWords.map(() => null);
  let next = 0;
  captionWords.forEach((word, index) => {
    const key = normalizeWord(word);
    if (!key) return;
    for (let candidate = next; candidate < Math.min(spoken.length, next + LOOKAHEAD); candidate++) {
      if (normalizeWord(spoken[candidate].text) === key) {
        spans[index] = { start: spoken[candidate].start, end: spoken[candidate].end };
        next = candidate + 1;
        return;
      }
    }
  });

  let index = 0;
  while (index < spans.length) {
    if (spans[index]) {
      index++;
      continue;
    }
    let runEnd = index;
    while (runEnd < spans.length && !spans[runEnd]) runEnd++;
    const from = index > 0 ? (spans[index - 1] as WordSpan).end : 0;
    const to = runEnd < spans.length ? (spans[runEnd] as WordSpan).start : duration;
    spread(captionWords.slice(index, runEnd), from, Math.max(from, to)).forEach((span, offset) => (spans[index + offset] = span));
    index = runEnd;
  }
  return spans as WordSpan[];
}
