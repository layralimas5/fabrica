import type { VideoTimeline } from './timeline';
import type { SpokenWord } from './wordAlignment';

/** Places every spoken sentence at its moment of the timeline, with silence in between. */
export function assembleNarration(sentences: Float32Array[], sampleRate: number, timeline: VideoTimeline): Float32Array {
  if (sentences.length !== timeline.sentences.length) throw new Error('A voz e o roteiro têm números diferentes de frases.');
  const output = new Float32Array(Math.ceil(timeline.duration * sampleRate));
  sentences.forEach((samples, index) => {
    const offset = Math.round(timeline.sentences[index].start * sampleRate);
    output.set(samples.subarray(0, Math.max(0, output.length - offset)), offset);
  });
  return output;
}

/**
 * Cuts the silence the voice leaves around a sentence, keeping a few milliseconds so words are not clipped,
 * and moves the word times by what was cut at the start.
 */
export function trimSilence(samples: Float32Array, words: SpokenWord[], sampleRate: number, threshold = 0.01, keepSeconds = 0.04): { samples: Float32Array; words: SpokenWord[] } {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= last) return { samples, words };
  const keep = Math.round(keepSeconds * sampleRate);
  const start = Math.max(0, first - keep);
  const trimmed = samples.slice(start, Math.min(samples.length, last + 1 + keep));
  const shift = start / sampleRate;
  const length = trimmed.length / sampleRate;
  const clamp = (time: number) => Math.min(length, Math.max(0, time - shift));
  return { samples: trimmed, words: words.map((word) => ({ ...word, start: clamp(word.start), end: clamp(word.end) })) };
}
