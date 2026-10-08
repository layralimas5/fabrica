import type { VideoScene } from './videoScript';

/** When each scene, caption and word is on screen, derived from how long each spoken sentence lasts. */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export interface TimedCaption {
  start: number;
  end: number;
  words: TimedWord[];
}

export interface TimedScene {
  index: number;
  start: number;
  end: number;
}

export interface TimedSentence {
  start: number;
  sceneIndex: number;
}

export interface VideoTimeline {
  scenes: TimedScene[];
  sentences: TimedSentence[];
  captions: TimedCaption[];
  /** Seconds. */
  duration: number;
}

export interface TimelineSpacing {
  /** Silence before the first word. */
  leadIn: number;
  /** Silence between sentences of the same scene. */
  sentenceGap: number;
  /** Silence when the picture changes. */
  sceneGap: number;
  /** Silence after the last word, so the video does not cut mid-breath. */
  tail: number;
}

export const DEFAULT_SPACING: TimelineSpacing = { leadIn: 0.2, sentenceGap: 0.18, sceneGap: 0.32, tail: 0.7 };

/** Spoken weight of a word: longer words take longer, punctuation adds the pause the voice makes. */
export function wordWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  const pause = /[.!?…]$/.test(word) ? 3 : /[,;:]$/.test(word) ? 2 : 0;
  return Math.max(letters, 1) + 1 + pause;
}

/** Spreads the words of one sentence over its spoken duration, proportionally to their weight. */
function timeWords(captions: string[], start: number, duration: number): TimedCaption[] {
  const groups = captions.map((caption) => caption.split(/\s+/).filter(Boolean));
  const total = groups.flat().reduce((sum, word) => sum + wordWeight(word), 0) || 1;
  let cursor = start;
  return groups.map((words) => {
    const timed = words.map((text) => {
      const length = (wordWeight(text) / total) * duration;
      const word = { text, start: cursor, end: cursor + length };
      cursor += length;
      return word;
    });
    return { start: timed[0]?.start ?? cursor, end: timed[timed.length - 1]?.end ?? cursor, words: timed };
  });
}

/** `durations` has the spoken length (seconds) of every sentence, in script order. */
export function buildTimeline(scenes: VideoScene[], durations: number[], spacing: TimelineSpacing = DEFAULT_SPACING): VideoTimeline {
  const expected = scenes.reduce((sum, scene) => sum + scene.sentences.length, 0);
  if (durations.length !== expected) throw new Error(`Esperava ${expected} trechos de voz e recebi ${durations.length}.`);

  const timedScenes: TimedScene[] = [];
  const sentences: TimedSentence[] = [];
  const captions: TimedCaption[] = [];
  let cursor = spacing.leadIn;
  let spoken = 0;

  scenes.forEach((scene, sceneIndex) => {
    const sceneStart = sceneIndex === 0 ? 0 : cursor - spacing.sceneGap / 2;
    scene.sentences.forEach((sentence, sentenceIndex) => {
      if (sentenceIndex > 0) cursor += spacing.sentenceGap;
      const duration = durations[spoken++];
      sentences.push({ start: cursor, sceneIndex });
      captions.push(...timeWords(sentence.captions, cursor, duration));
      cursor += duration;
    });
    const isLast = sceneIndex === scenes.length - 1;
    const end = isLast ? cursor + spacing.tail : cursor + spacing.sceneGap / 2;
    timedScenes.push({ index: sceneIndex, start: sceneStart, end });
    cursor += isLast ? spacing.tail : spacing.sceneGap;
  });

  return { scenes: timedScenes, sentences, captions, duration: timedScenes[timedScenes.length - 1]?.end ?? 0 };
}

export function sceneAt(timeline: VideoTimeline, time: number): TimedScene | null {
  return timeline.scenes.find((scene) => time >= scene.start && time < scene.end) ?? timeline.scenes[timeline.scenes.length - 1] ?? null;
}

/** The caption on screen stays until the next one starts, so the text never blinks between words. */
export function captionAt(timeline: VideoTimeline, time: number): TimedCaption | null {
  const { captions } = timeline;
  for (let index = captions.length - 1; index >= 0; index--) {
    const caption = captions[index];
    if (time < caption.start) continue;
    const next = captions[index + 1];
    const holdUntil = next ? next.start : caption.end + 0.4;
    return time < holdUntil ? caption : null;
  }
  return null;
}
