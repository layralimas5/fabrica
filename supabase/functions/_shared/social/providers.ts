import { createFacebookProvider } from './facebook.ts';
import { createInstagramProvider } from './instagram.ts';
import { createTikTokProvider } from './tiktok.ts';
import { createYouTubeProvider } from './youtube.ts';
import type { FetchFn, Provider, ProviderEnv, SocialPlatform } from './types.ts';

export const PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'tiktok', 'youtube'];

export function createProvider(platform: SocialPlatform, env: ProviderEnv, fetchFn: FetchFn): Provider {
  switch (platform) {
    case 'instagram':
      return createInstagramProvider(env, fetchFn);
    case 'facebook':
      return createFacebookProvider(env, fetchFn);
    case 'tiktok':
      return createTikTokProvider(env, fetchFn);
    case 'youtube':
      return createYouTubeProvider(env, fetchFn);
  }
}

export function isPlatform(value: unknown): value is SocialPlatform {
  return PLATFORMS.includes(value as SocialPlatform);
}

export interface PlatformConfig {
  configured: boolean;
  /** Names of the secrets still missing (never their values). */
  missing: string[];
  scopes: string[];
}

/** What the Contas screen needs to show "configuração pendente" instead of a button that cannot work. */
export function configStatus(env: ProviderEnv, fetchFn: FetchFn): Record<SocialPlatform, PlatformConfig> & { tokenKey: boolean } {
  const shared = ['TOKEN_ENCRYPTION_KEY', 'APP_URL'].filter((name) => !env.get(name));
  const status = Object.fromEntries(
    PLATFORMS.map((platform) => {
      const provider = createProvider(platform, env, fetchFn);
      const missing = [...provider.requiredSecrets.filter((name) => !env.get(name)), ...shared];
      return [platform, { configured: missing.length === 0, missing, scopes: provider.scopes }];
    }),
  ) as Record<SocialPlatform, PlatformConfig>;
  return { ...status, tokenKey: Boolean(env.get('TOKEN_ENCRYPTION_KEY')) };
}
