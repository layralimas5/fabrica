import type { SpokenWord } from '../../domain/video/wordAlignment';

export interface VoiceOption {
  /** e.g. "pt-BR-FranciscaNeural". */
  id: string;
  /** e.g. "pt-BR". */
  locale: string;
  gender: 'female' | 'male';
  /** e.g. "Francisca", "ThalitaMultilingual". */
  name: string;
}

export interface SpokenAudio {
  /** Mono samples at the synthesizer's sample rate. */
  samples: Float32Array;
  /** When each word was said, as reported by the voice. */
  words: SpokenWord[];
}

export interface SpeechSynthesizer {
  readonly sampleRate: number;
  listVoices(): Promise<VoiceOption[]>;
  synthesize(text: string, voiceId: string, speed: number): Promise<SpokenAudio>;
}

export interface EncodeRequest {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** Draws the frame of a moment (seconds) on the canvas the encoder reads. */
  drawFrame: (context: CanvasRenderingContext2D, time: number) => void;
  narration: { samples: Float32Array; sampleRate: number };
  /** Optional background song, mixed low under the voice. */
  music: { file: Blob; volume: number } | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface VideoEncoderPort {
  /** True when this browser can write an MP4 with H.264 video and AAC audio. */
  supported(): Promise<boolean>;
  encode(request: EncodeRequest): Promise<Blob>;
}
