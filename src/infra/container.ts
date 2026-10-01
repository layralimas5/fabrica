import { createClient } from '@supabase/supabase-js';
import type { Services } from '../application/ports';
import { ClaudeAi } from './ai/claudeAi';
import { HeuristicAi } from './ai/heuristicAi';
import { DemoAssets, DemoAuth, DemoBrandKits, DemoCarousels } from './demo/demoServices';
import { SupabaseAssets, SupabaseAuth, SupabaseBrandKits, SupabaseCarousels } from './supabase/supabaseServices';

/**
 * Composition root. With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY the app runs on Supabase and Claude;
 * without them it runs fully in the browser (demo mode) with the heuristic engine.
 */
export function createServices(): Services {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { auth: new DemoAuth(), brandKits: new DemoBrandKits(), assets: new DemoAssets(), carousels: new DemoCarousels(), ai: new HeuristicAi() };
  }

  const client = createClient(url, anonKey);
  const useHeuristic = import.meta.env.VITE_AI_ENGINE === 'heuristic';
  return {
    auth: new SupabaseAuth(client),
    brandKits: new SupabaseBrandKits(client),
    assets: new SupabaseAssets(client),
    carousels: new SupabaseCarousels(client),
    ai: useHeuristic ? new HeuristicAi() : new ClaudeAi(client),
  };
}
