export interface VoiceOption {
  id: string;
  label: string;
}

export interface LoadProgress {
  /** 0..1, or null while the size is unknown. */
  fraction: number | null;
  label: string;
}

/** Text to speech that runs on the user's own machine. */
export interface SpeechSynthesizer {
  readonly voices: readonly VoiceOption[];
  readonly sampleRate: number;
  /** Downloads and loads the voice model (only the first time is slow). */
  prepare(onProgress?: (progress: LoadProgress) => void): Promise<void>;
  /** Mono samples of one sentence spoken by the voice. */
  synthesize(text: string, voiceId: string, speed: number): Promise<Float32Array>;
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
