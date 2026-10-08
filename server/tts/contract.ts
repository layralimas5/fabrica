/** What the browser and the voice function exchange. Shared by both sides. */

export interface SpokenWordTiming {
  text: string;
  /** Seconds from the start of the audio. */
  start: number;
  end: number;
}

export interface SpeechResult {
  /** MP3, base64. */
  audio: string;
  words: SpokenWordTiming[];
}

export interface VoiceInfo {
  /** e.g. "pt-BR-FranciscaNeural". */
  id: string;
  /** e.g. "pt-BR". */
  locale: string;
  gender: 'female' | 'male';
  /** e.g. "Francisca", "ThalitaMultilingual". */
  name: string;
}

export interface SpeechRequest {
  text: string;
  voice: string;
  rate: number;
}

export const MAX_SPEECH_TEXT = 1200;
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;
export const VOICE_ID = /^[a-z]{2,3}-[A-Za-z]{2,4}(?:-[A-Za-z]+)?-[A-Za-z]+Neural$/;

/** Checks a request body; returns the reason it is invalid, or the clean request. */
export function parseSpeechRequest(body: unknown): SpeechRequest | string {
  if (!body || typeof body !== 'object') return 'Corpo da requisição inválido.';
  const { text, voice, rate } = body as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return 'Falta o texto.';
  if (text.length > MAX_SPEECH_TEXT) return `Texto longo demais (máximo ${MAX_SPEECH_TEXT} caracteres por frase).`;
  if (typeof voice !== 'string' || !VOICE_ID.test(voice)) return 'Voz inválida.';
  const speed = typeof rate === 'number' ? rate : 1;
  if (!Number.isFinite(speed) || speed < MIN_RATE || speed > MAX_RATE) return 'Ritmo inválido.';
  return { text: text.trim(), voice, rate: speed };
}
