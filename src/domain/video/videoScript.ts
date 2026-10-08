/**
 * Script of a narrated short video: each paragraph is a scene (one picture on screen),
 * each sentence is spoken in one go, and the captions show a few words at a time.
 */

export interface VideoSentence {
  text: string;
  /** Groups of a few words shown together on screen, in reading order. */
  captions: string[];
}

export interface VideoScene {
  sentences: VideoSentence[];
}

export const MAX_CAPTION_WORDS = 4;
export const MAX_SCENES = 20;
export const MAX_SCRIPT_LENGTH = 3000;

/** "Cena 1:", "CENA 2 -", "Gancho:", "CTA:", "Slide 3," at the start of a paragraph are labels, not speech. */
const LABEL = /^\s*(?:(?:cena|slide|parte)\s*\d+|gancho|hook|problema|consequ[eê]ncia|insight|solu[cç][aã]o|cta|fala|narra[cç][aã]o)\s*[:,.\-–—]\s*/i;
const SENTENCE_END = /(?<=[.!?…])\s+/;
const CAPTION_BREAK = /[,;:.!?…]$/;
/** Short words that lean on the next one: a caption never ends on them ("precisa de / mais disciplina"). */
const LEANING_WORDS = new Set(['a', 'o', 'as', 'os', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'que', 'pra', 'para', 'com', 'por', 'se', 'te', 'me', 'ao', 'à', 'é', 'eu', 'seu', 'sua', 'meu', 'minha', 'mais', 'tão', 'não']);
const leans = (word: string) => LEANING_WORDS.has(word.toLowerCase());

export function stripLabel(paragraph: string): string {
  return paragraph.replace(LABEL, '').trim();
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .replace(/\s+/g, ' ')
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

/** Breaks a sentence into caption groups: at most MAX_CAPTION_WORDS words, closing early after punctuation. */
export function captionGroups(sentence: string, maxWords = MAX_CAPTION_WORDS): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (CAPTION_BREAK.test(word)) {
      groups.push(current);
      current = [];
    } else if (current.length >= maxWords) {
      // Carry the leaning words at the end over to the next caption, keeping at least two words here.
      let cut = current.length;
      while (cut > 2 && leans(current[cut - 1])) cut--;
      groups.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current.length) {
    // A lone last word reads badly on screen: it joins the previous group when that one still has room.
    const previous = groups[groups.length - 1];
    if (current.length === 1 && previous && previous.length < maxWords && !CAPTION_BREAK.test(previous[previous.length - 1])) previous.push(...current);
    else groups.push(current);
  }
  return groups.map((group) => group.join(' '));
}

/**
 * Paragraphs (blank line between them) become scenes. A script written as one block
 * becomes one scene per sentence, so the picture still changes along the video.
 */
export function parseVideoScript(raw: string): VideoScene[] {
  const paragraphs = raw
    .slice(0, MAX_SCRIPT_LENGTH)
    .split(/\n\s*\n/)
    .map(stripLabel)
    .filter(Boolean);
  const blocks = paragraphs.length === 1 ? splitSentences(paragraphs[0]) : paragraphs;
  return blocks
    .map((block) => ({ sentences: splitSentences(stripLabel(block)).map((text) => ({ text, captions: captionGroups(text) })) }))
    .filter((scene) => scene.sentences.length > 0)
    .slice(0, MAX_SCENES);
}

export function sentencesOf(scenes: VideoScene[]): VideoSentence[] {
  return scenes.flatMap((scene) => scene.sentences);
}
