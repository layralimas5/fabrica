import type { AiService } from '../../application/ports';
import type { CarouselDraft, DraftRequest, HooksRequest, RewriteRequest, SlideDraft, SlideText } from '../../domain/aiContract';
import { CTA_BY_OBJECTIVE, NARRATIVES, type ContentType, type SlideRole } from '../../domain/content';
import { limitWords, splitSentences, stripTrailingPeriod, wordCount } from '../../domain/text';

const REPEATABLE: SlideRole[] = ['point', 'item', 'step', 'mistake', 'argument'];
const TEXT_ROLES: SlideRole[] = ['insight', 'conclusion', 'belief', 'summary'];
const DEFAULT_SLIDES = { min: 5, max: 10 };
const SHORT_TITLE_WORDS = 10;

/**
 * Offline engine used in demo mode or when the AI endpoint is not configured.
 * It never invents content: slides only reorganize the user's own sentences.
 */
export class HeuristicAi implements AiService {
  readonly engine = 'heuristic' as const;

  async draftCarousel(request: DraftRequest): Promise<CarouselDraft> {
    const sentences = splitSentences(request.copy);
    if (sentences.length === 0) throw new Error('A copy está vazia.');

    const type = request.contentType === 'auto' ? detectType(request.copy) : request.contentType;
    const [hookSentence, ...material] = sentences;
    const desired = request.slideCount ?? clamp(sentences.length + 1, DEFAULT_SLIDES.min, DEFAULT_SLIDES.max);
    const contentSlots = Math.max(1, Math.min(desired - 2, material.length));
    const roles = fitRoles(NARRATIVES[type], contentSlots);
    const chunks = distribute(material.length > 0 ? material : [hookSentence], contentSlots);

    const hook: SlideDraft = slideDraft(roles.first, hookSentence, null, true);
    const middle = chunks.map((chunk, index) => {
      const role = roles.middle[index];
      const [title, ...rest] = chunk;
      const wantsImage = !TEXT_ROLES.includes(role) && index % 2 === 0;
      return slideDraft(role, title, rest.join(' ') || null, wantsImage);
    });
    const cta = slideDraft('cta', CTA_BY_OBJECTIVE[request.objective], null, false);

    return { title: limitWords(stripTrailingPeriod(hookSentence), 8), slides: [hook, ...middle, cta] };
  }

  async rewriteSlide({ mode, slide }: RewriteRequest): Promise<SlideText> {
    if (mode === 'shorten') {
      const bodySentences = splitSentences(slide.body ?? '');
      return {
        title: limitWords(slide.title, SHORT_TITLE_WORDS),
        subtitle: null,
        body: bodySentences.length > 1 ? bodySentences[0] : null,
        bullets: slide.bullets.slice(0, 3).map((bullet) => limitWords(bullet, 6)),
      };
    }

    if (slide.body) {
      const [first, ...rest] = splitSentences(slide.body);
      return { title: first, subtitle: null, body: [slide.title, ...rest].join(' '), bullets: slide.bullets };
    }
    const base = lowerFirst(stripTrailingPeriod(slide.title));
    const variants = [`A verdade é que ${base}.`, `Repara: ${base}.`, `E se ${base}?`, `Pouca gente percebe, mas ${base}.`];
    return { ...slide, title: pick(variants.filter((variant) => variant !== slide.title)) };
  }

  async generateHooks({ hook, copy, count }: HooksRequest): Promise<string[]> {
    const topic = mainTopic(copy) ?? 'isso';
    const original = stripTrailingPeriod(hook);
    const items = splitSentences(copy).length;
    const candidates = [
      `Ninguém te conta isso sobre ${topic}.`,
      `O erro que quase todo mundo comete com ${topic}.`,
      `${original}? Nem sempre.`,
      `Pare de tentar resolver ${topic} do jeito difícil.`,
      `Eu demorei anos pra entender isso sobre ${topic}.`,
      `${Math.min(Math.max(items - 1, 3), 7)} verdades sobre ${topic} que ninguém fala.`,
      `Se ${topic} trava sua rotina, leia até o fim.`,
    ];
    return shuffle(candidates.filter((candidate) => candidate !== hook)).slice(0, count);
  }
}

function slideDraft(role: SlideRole, title: string, body: string | null, wantsImage: boolean): SlideDraft {
  return { role, title, subtitle: null, body, bullets: [], assetId: null, layout: null, wantsImage };
}

function detectType(copy: string): Exclude<ContentType, 'auto'> {
  const text = copy.toLowerCase();
  if (/\berro/.test(text)) return 'erros';
  if (/\bpasso\b|\bpassos\b/.test(text)) return 'tutorial';
  if (/^\s*([-•*]|\d+[.)])\s/m.test(copy)) return 'lista';
  if (/\bquando eu\b|\bhá \d+ anos\b|\bdescobri\b/.test(text)) return 'storytelling';
  if (/\bvocê já\b|\bvocê sente\b|\bcansad/.test(text)) return 'dor';
  return 'educativo';
}

/** Adapts a narrative skeleton to the number of content slots, stretching or trimming its repeatable middle. */
function fitRoles(narrative: SlideRole[], slots: number): { first: SlideRole; middle: SlideRole[] } {
  const [first, ...rest] = narrative;
  const middle = rest.filter((role) => role !== 'cta');
  const repeatable = middle.find((role) => REPEATABLE.includes(role)) ?? middle[0] ?? 'point';

  while (middle.length < slots) middle.splice(middle.lastIndexOf(repeatable) + 1, 0, repeatable);
  while (middle.length > slots) {
    const repeats = middle.filter((role) => role === repeatable).length;
    middle.splice(repeats > 1 ? middle.lastIndexOf(repeatable) : Math.max(0, middle.length - 2), 1);
  }
  return { first: first ?? 'hook', middle };
}

/** Splits sentences into consecutive groups with similar word counts. */
function distribute(sentences: string[], groups: number): string[][] {
  const total = sentences.reduce((sum, sentence) => sum + wordCount(sentence), 0);
  const target = total / groups;
  const result: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  sentences.forEach((sentence, index) => {
    current.push(sentence);
    currentWords += wordCount(sentence);
    const sentencesAfter = sentences.length - index - 1;
    const groupsAfter = groups - result.length - 1;
    const mustClose = sentencesAfter === groupsAfter;
    if (groupsAfter > 0 && (currentWords >= target || mustClose)) {
      result.push(current);
      current = [];
      currentWords = 0;
    }
  });
  if (current.length) result.push(current);
  return result;
}

function mainTopic(copy: string): string | null {
  const counts = new Map<string, number>();
  for (const word of copy.toLowerCase().match(/[a-zà-ú]{5,}/g) ?? []) {
    if (['porque', 'quando', 'sobre', 'nunca', 'sempre', 'precisa', 'muito', 'mesmo', 'então', 'ainda', 'todos', 'nossa', 'vocês'].includes(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
