import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { SpeechResult, VoiceInfo } from './contract';

/**
 * Microsoft's neural voices (the ones behind "Ler em voz alta" in Edge), reached from the server
 * because the service only accepts Edge as a browser. Free, no key, and it reports when each word is spoken.
 */

const TICKS_PER_SECOND = 10_000_000;
const TIMEOUT_MS = 20_000;

interface BoundaryMessage {
  Metadata?: { Type: string; Data: { Offset: number; Duration: number; text: { Text: string } } }[];
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] ?? char);

function wordsFrom(chunk: string): SpeechResult['words'] {
  try {
    const message = JSON.parse(chunk) as BoundaryMessage;
    return (message.Metadata ?? [])
      .filter((item) => item.Type === 'WordBoundary')
      .map((item) => ({ text: item.Data.text.Text, start: item.Data.Offset / TICKS_PER_SECOND, end: (item.Data.Offset + item.Data.Duration) / TICKS_PER_SECOND }));
  } catch {
    return [];
  }
}

export async function synthesizeSpeech(text: string, voice: string, rate: number): Promise<SpeechResult> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = tts.toStream(escapeXml(text), { rate });
    const audio: Buffer[] = [];
    const words: SpeechResult['words'] = [];
    audioStream.on('data', (chunk: Buffer) => audio.push(chunk));
    metadataStream?.on('data', (chunk: Buffer) => words.push(...wordsFrom(chunk.toString())));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O serviço de voz demorou demais para responder.')), TIMEOUT_MS);
      audioStream.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const bytes = Buffer.concat(audio);
    if (!bytes.length) throw new Error('O serviço de voz não devolveu áudio.');
    return { audio: bytes.toString('base64'), words: words.sort((a, b) => a.start - b.start) };
  } finally {
    tts.close();
  }
}

let cachedVoices: Promise<VoiceInfo[]> | null = null;

export function listVoices(): Promise<VoiceInfo[]> {
  cachedVoices ??= new MsEdgeTTS()
    .getVoices()
    .then((voices) =>
      voices.map((voice) => ({
        id: voice.ShortName,
        locale: voice.Locale,
        gender: voice.Gender === 'Female' ? ('female' as const) : ('male' as const),
        name: voice.ShortName.split('-').slice(2).join('-').replace(/Neural$/, ''),
      })),
    )
    .catch((error: unknown) => {
      cachedVoices = null;
      throw error;
    });
  return cachedVoices;
}
