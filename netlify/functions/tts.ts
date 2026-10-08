import { handleTts } from '../../server/tts/handler';

/** Served at /api/tts (redirect in netlify.toml). */
export default (request: Request) =>
  handleTts(request, {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
  });
