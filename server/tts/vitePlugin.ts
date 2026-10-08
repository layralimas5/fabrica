import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { handleTts, type TtsEnvironment } from './handler';

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Serves /api/tts during `npm run dev`, the same handler the Netlify function runs in production. */
export function ttsDevServer(env: TtsEnvironment): Plugin {
  return {
    name: 'fabrica-tts',
    configureServer(server) {
      server.middlewares.use('/api/tts', (request, response) => {
        void (async () => {
          const body = request.method === 'POST' ? new Uint8Array(await readBody(request)) : undefined;
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(key, value);
          const result = await handleTts(new Request(`http://localhost${request.url ?? ''}`, { method: request.method, headers, body }), env);
          response.statusCode = result.status;
          result.headers.forEach((value, key) => response.setHeader(key, value));
          response.end(Buffer.from(await result.arrayBuffer()));
        })().catch((error: unknown) => {
          console.error('[tts]', error);
          response.statusCode = 500;
          response.end();
        });
      });
    },
  };
}
