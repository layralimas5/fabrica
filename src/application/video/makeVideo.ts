import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from '../../domain/video/look';
import { assembleNarration, trimSilence } from '../../domain/video/narration';
import { buildTimeline, type SpokenSentence, type VideoTimeline } from '../../domain/video/timeline';
import { sentencesOf, type VideoScene } from '../../domain/video/videoScript';
import { wordWeight } from '../../domain/video/wordAlignment';
import type { SpeechSynthesizer, SpokenAudio, VideoEncoderPort } from './ports';

export type VideoStage = { step: 'voice'; done: number; total: number } | { step: 'video'; fraction: number };

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
const PARALLEL_SENTENCES = 3;

/** Timeline guessed from the text alone, for the preview before any voice is generated. */
export function estimatedTimeline(scenes: VideoScene[], speed = 1): VideoTimeline {
  const spoken = sentencesOf(scenes).map((sentence): SpokenSentence => ({
    duration: (sentence.text.split(/\s+/).reduce((sum, word) => sum + wordWeight(word), 0) * SECONDS_PER_WEIGHT) / speed,
    words: [],
  }));
  return buildTimeline(scenes, spoken);
}

async function speakAll(speech: SpeechSynthesizer, texts: string[], voiceId: string, speed: number, onDone: (done: number) => void, signal?: AbortSignal): Promise<SpokenAudio[]> {
  const results: SpokenAudio[] = new Array(texts.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < texts.length) {
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      const index = next++;
      const spoken = await speech.synthesize(texts[index], voiceId, speed);
      results[index] = trimSilence(spoken.samples, spoken.words, speech.sampleRate);
      onDone(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_SENTENCES, texts.length) }, worker));
  return results;
}

/** Voice for each sentence, then the timeline from when each word was said, then every frame encoded into an MP4. */
export async function makeVideo(speech: SpeechSynthesizer, encoder: VideoEncoderPort, request: MakeVideoRequest): Promise<MadeVideo> {
  const sentences = sentencesOf(request.scenes);
  if (!sentences.length) throw new Error('Escreva o roteiro antes de gerar o vídeo.');

  request.onStage?.({ step: 'voice', done: 0, total: sentences.length });
  const voices = await speakAll(
    speech,
    sentences.map((sentence) => sentence.text),
    request.voiceId,
    request.speed,
    (done) => request.onStage?.({ step: 'voice', done, total: sentences.length }),
    request.signal,
  );

  const timeline = buildTimeline(
    request.scenes,
    voices.map((voice) => ({ duration: voice.samples.length / speech.sampleRate, words: voice.words })),
  );
  const blob = await encoder.encode({
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    fps: VIDEO_FPS,
    duration: timeline.duration,
    drawFrame: request.painterFor(timeline),
    narration: {
      samples: assembleNarration(
        voices.map((voice) => voice.samples),
        speech.sampleRate,
        timeline,
      ),
      sampleRate: speech.sampleRate,
    },
    music: request.music,
    onProgress: (fraction) => request.onStage?.({ step: 'video', fraction }),
    signal: request.signal,
  });
  return { blob, duration: timeline.duration };
}

/** One sentence spoken, to hear the voice before generating the whole video. */
export async function previewVoice(speech: SpeechSynthesizer, text: string, voiceId: string, speed: number): Promise<Float32Array> {
  const spoken = await speech.synthesize(text, voiceId, speed);
  return trimSilence(spoken.samples, spoken.words, speech.sampleRate).samples;
}
