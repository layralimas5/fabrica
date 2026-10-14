import { createClient } from '@supabase/supabase-js';
import type { Services } from '../application/ports';
import { ClaudeAi } from './ai/claudeAi';
import { HeuristicAi } from './ai/heuristicAi';
import { DemoAccounts, DemoAssets, DemoAuth, DemoBrandKits, DemoCarousels, DemoContentRecords, DemoContentVersions, DemoPresets, demoCalendarEntries, demoExperiments, demoInsights, demoProjects, demoPublications, LocalBackup } from './demo/demoServices';
import {
  SupabaseAccounts,
  SupabaseAssets,
  SupabaseAuth,
  SupabaseBrandKits,
  supabaseCalendarEntries,
  SupabaseCarousels,
  SupabaseContentRecords,
  SupabaseContentVersions,
  supabaseInsights,
  supabaseProjects,
  supabasePublications,
  supabaseExperiments,
  SupabasePresets,
} from './supabase/supabaseServices';
import { SupabaseBackup } from './supabase/supabaseBackup';
import { SupabaseSocial } from './supabase/supabaseSocial';
import { UnavailableSocial } from './demo/unavailableSocial';
import { LocalTracking } from './demo/localTracking';
import { SupabaseTracking } from './supabase/supabaseTracking';
import { SupabasePublishing } from './supabase/supabasePublishing';
import { UnavailablePublishing } from './demo/unavailablePublishing';

/** Address of the Fábrica itself, base of the short links /l/<slug>. */
const appUrl = (import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin;

/**
 * Composition root. With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY the app runs on Supabase and Claude;
 * without them it runs fully in the browser (local mode, no login) with the heuristic engine.
 */
export function createServices(): Services {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      auth: new DemoAuth(),
      brandKits: new DemoBrandKits(),
      assets: new DemoAssets(),
      carousels: new DemoCarousels(),
      accounts: new DemoAccounts(),
      presets: new DemoPresets(),
      contentRecords: new DemoContentRecords(),
      experiments: demoExperiments(),
      calendarEntries: demoCalendarEntries(),
      projects: demoProjects(),
      publications: demoPublications(),
      contentVersions: new DemoContentVersions(),
      social: new UnavailableSocial(),
      tracking: new LocalTracking(appUrl),
      insights: demoInsights(),
      publishing: new UnavailablePublishing(),
      ai: new HeuristicAi(),
      backup: new LocalBackup(),
    };
  }

  const client = createClient(url, anonKey);
  const useHeuristic = import.meta.env.VITE_AI_ENGINE === 'heuristic';
  const repositories = {
    brandKits: new SupabaseBrandKits(client),
    assets: new SupabaseAssets(client),
    carousels: new SupabaseCarousels(client),
    accounts: new SupabaseAccounts(client),
    presets: new SupabasePresets(client),
    contentRecords: new SupabaseContentRecords(client),
    experiments: supabaseExperiments(client),
    calendarEntries: supabaseCalendarEntries(client),
    projects: supabaseProjects(client),
    publications: supabasePublications(client),
  };
  return {
    auth: new SupabaseAuth(client),
    ...repositories,
    contentVersions: new SupabaseContentVersions(client),
    social: new SupabaseSocial(client),
    tracking: new SupabaseTracking(client, url, appUrl),
    insights: supabaseInsights(client),
    publishing: new SupabasePublishing(client),
    ai: useHeuristic ? new HeuristicAi() : new ClaudeAi(client),
    backup: new SupabaseBackup(client, repositories),
  };
}
