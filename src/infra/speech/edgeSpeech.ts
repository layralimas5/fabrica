import type { SpeechResult, VoiceInfo } from '../../../server/tts/contract';
import type { SpeechSynthesizer, SpokenAudio, VoiceOption } from '../../application/video/ports';

const ENDPOINT = '/api/tts';
const SAMPLE_RATE = 24000;

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function failureMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `O serviço de voz respondeu ${response.status}.`;
}

/** Microsoft neural voices through the Fábrica's own /api/tts function. */
export class EdgeSpeech implements SpeechSynthesizer {
  readonly sampleRate = SAMPLE_RATE;
  private voices: Promise<VoiceOption[]> | null = null;

  /** `accessToken` proves the user is signed in (null in local mode). */
  constructor(private readonly accessToken: () => Promise<string | null>) {}

  private async headers(): Promise<HeadersInit> {
    const token = await this.accessToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  listVoices(): Promise<VoiceOption[]> {
    this.voices ??= (async () => {
      const response = await fetch(ENDPOINT, { headers: await this.headers() });
      if (!response.ok) throw new Error(await failureMessage(response));
      return ((await response.json()) as { voices: VoiceInfo[] }).voices;
    })().catch((error: unknown) => {
      this.voices = null;
      throw error;
    });
    return this.voices;
  }

  async synthesize(text: string, voiceId: string, speed: number): Promise<SpokenAudio> {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: await this.headers(), body: JSON.stringify({ text, voice: voiceId, rate: speed }) });
    if (!response.ok) throw new Error(await failureMessage(response));
    const result = (await response.json()) as SpeechResult;
    const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const buffer = await decoder.decodeAudioData(base64ToBytes(result.audio));
    return { samples: buffer.getChannelData(0), words: result.words };
  }
}
