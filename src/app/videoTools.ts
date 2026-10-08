import type { AuthService } from '../application/ports';
import type { SpeechSynthesizer, VideoEncoderPort } from '../application/video/ports';
import { EdgeSpeech } from '../infra/speech/edgeSpeech';
import { Mp4Encoder } from '../infra/video/mp4Encoder';

let tools: { speech: SpeechSynthesizer; encoder: VideoEncoderPort } | null = null;

/** One set per tab: the voice list is fetched once. */
export function videoTools(auth: AuthService) {
  tools ??= { speech: new EdgeSpeech(() => auth.accessToken()), encoder: new Mp4Encoder() };
  return tools;
}
