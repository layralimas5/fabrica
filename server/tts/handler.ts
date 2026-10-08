import { parseSpeechRequest } from './contract';
import { listVoices, synthesizeSpeech } from './edgeTts';

export interface TtsEnvironment {
  /** With both set, only signed-in users of the Fábrica can use the voice. */
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

async function isSignedIn(request: Request, env: TtsEnvironment): Promise<boolean> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return true;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.supabaseAnonKey, Authorization: authorization } });
  return response.ok;
}

/** GET lists the voices; POST { text, voice, rate } speaks one sentence. */
export async function handleTts(request: Request, env: TtsEnvironment): Promise<Response> {
  try {
    if (!(await isSignedIn(request, env))) return json(401, { error: 'Entre na Fábrica para usar a voz.' });
    if (request.method === 'GET') return json(200, { voices: await listVoices() }, { 'Cache-Control': 'private, max-age=86400' });
    if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' }, { Allow: 'GET, POST' });

    const body: unknown = await request.json().catch(() => null);
    const parsed = parseSpeechRequest(body);
    if (typeof parsed === 'string') return json(400, { error: parsed });
    return json(200, await synthesizeSpeech(parsed.text, parsed.voice, parsed.rate));
  } catch (cause) {
    console.error('[tts]', cause);
    return json(502, { error: 'O serviço de voz não respondeu. Tente de novo em instantes.' });
  }
}
