import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { ttsDevServer } from './server/tts/vitePlugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [react(), tailwindcss(), ttsDevServer({ supabaseUrl: env.VITE_SUPABASE_URL, supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY })],
    server: { port: 5320, strictPort: true },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
