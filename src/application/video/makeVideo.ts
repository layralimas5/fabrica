import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from '../../domain/video/look';
import { assembleNarration, trimSilence } from '../../domain/video/narration';
import { buildTimeline, wordWeight, type VideoTimeline } from '../../domain/video/timeline';
import { sentencesOf, type VideoScene } from '../../domain/video/videoScript';
import type { LoadProgress, SpeechSynthesizer, VideoEncoderPort } from './ports';

export type VideoStage =
  | { step: 'loading'; progress: LoadProgress }
  | { step: 'voice'; done: number; total: number }
  | { step: 'video'; fraction: number };

export interface MakeVideoRequest {
  scenes: VideoScene[];
  voiceId: string;
  speed: number;
  music: { file: Blob; volume: number } | null;
  /** Builds the frame painter once the timeline (with the real voice timing) is known. */
  painterFor: (timeline: VideoTimeline) => (context: CanvasRenderingContext2D, time: number) => void;
  onStage?: (stage: VideoStage) => void;
  signal?: AbortSignal;
}

export interface MadeVideo {
  blob: Blob;
  duration: number;
}

const SECONDS_PER_WEIGHT = 0.058;

/** Timeline guessed from the text alone, for the preview before any voice is generated. */
export function estimatedTimeline(scenes: VideoScene[], speed = 1): VideoTimeline {
  const durations = sentencesOf(scenes).map((sentence) => (sentence.text.split(/\s+/).reduce((sum, word) => sum + wordWeight(word), 0) * SECONDS_PER_WEIGHT) / speed);
  return buildTimeline(scenes, durations);
}

/** Voice for each sentence, then the timeline, then every frame encoded into an MP4. */
export async function makeVideo(speech: SpeechSynthesizer, encoder: VideoEncoderPort, request: MakeVideoRequest): Promise<MadeVideo> {
  const sentences = sentencesOf(request.scenes);
  if (!sentences.length) throw new Error('Escreva o roteiro antes de gerar o vídeo.');

  await speech.prepare((progress) => request.onStage?.({ step: 'loading', progress }));

  const voices: Float32Array[] = [];
  for (const [index, sentence] of sentences.entries()) {
    if (request.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    request.onStage?.({ step: 'voice', done: index, total: sentences.length });
    voices.push(trimSilence(await speech.synthesize(sentence.text, request.voiceId, request.speed), speech.sampleRate));
  }
  request.onStage?.({ step: 'voice', done: sentences.length, total: sentences.length });

  const timeline = buildTimeline(
    request.scenes,
    voices.map((samples) => samples.length / speech.sampleRate),
  );
  const blob = await encoder.encode({
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    fps: VIDEO_FPS,
    duration: timeline.duration,
    drawFrame: request.painterFor(timeline),
    narration: { samples: assembleNarration(voices, speech.sampleRate, timeline), sampleRate: speech.sampleRate },
    music: request.music,
    onProgress: (fraction) => request.onStage?.({ step: 'video', fraction }),
    signal: request.signal,
  });
  return { blob, duration: timeline.duration };
}

/** One sentence spoken, to hear the voice before generating the whole video. */
export async function previewVoice(speech: SpeechSynthesizer, text: string, voiceId: string, speed: number, onProgress?: (progress: LoadProgress) => void): Promise<Float32Array> {
  await speech.prepare(onProgress);
  return trimSilence(await speech.synthesize(text, voiceId, speed), speech.sampleRate);
}
