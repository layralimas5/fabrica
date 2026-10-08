import type { SpeechSynthesizer, VideoEncoderPort } from '../application/video/ports';
import { KokoroSpeech } from '../infra/speech/kokoroSpeech';
import { Mp4Encoder } from '../infra/video/mp4Encoder';

let tools: { speech: SpeechSynthesizer; encoder: VideoEncoderPort } | null = null;

/** One voice worker per tab: the model stays loaded between videos. */
export function videoTools() {
  tools ??= { speech: new KokoroSpeech(), encoder: new Mp4Encoder() };
  return tools;
}
