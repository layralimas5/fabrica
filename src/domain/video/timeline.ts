import type { VideoScene } from './videoScript';
import { alignWords, type SpokenWord } from './wordAlignment';

/** When each scene, caption and word is on screen, derived from the voice of each sentence. */

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

/** One sentence as the voice spoke it: its length and, when the voice reports it, when each word was said. */
export interface SpokenSentence {
  duration: number;
  words: SpokenWord[];
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

function timeCaptions(captions: string[], start: number, spoken: SpokenSentence): TimedCaption[] {
  const groups = captions.map((caption) => caption.split(/\s+/).filter(Boolean));
  const spans = alignWords(groups.flat(), spoken.words, spoken.duration);
  let index = 0;
  return groups.map((words) => {
    const timed = words.map((text) => {
      const span = spans[index++];
      return { text, start: start + span.start, end: start + span.end };
    });
    return { start: timed[0]?.start ?? start, end: timed[timed.length - 1]?.end ?? start, words: timed };
  });
}

export function buildTimeline(scenes: VideoScene[], spoken: SpokenSentence[], spacing: TimelineSpacing = DEFAULT_SPACING): VideoTimeline {
  const expected = scenes.reduce((sum, scene) => sum + scene.sentences.length, 0);
  if (spoken.length !== expected) throw new Error(`Esperava ${expected} trechos de voz e recebi ${spoken.length}.`);

  const timedScenes: TimedScene[] = [];
  const sentences: TimedSentence[] = [];
  const captions: TimedCaption[] = [];
  let cursor = spacing.leadIn;
  let next = 0;

  scenes.forEach((scene, sceneIndex) => {
    const sceneStart = sceneIndex === 0 ? 0 : cursor - spacing.sceneGap / 2;
    scene.sentences.forEach((sentence, sentenceIndex) => {
      if (sentenceIndex > 0) cursor += spacing.sentenceGap;
      const voice = spoken[next++];
      sentences.push({ start: cursor, sceneIndex });
      captions.push(...timeCaptions(sentence.captions, cursor, voice));
      cursor += voice.duration;
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
