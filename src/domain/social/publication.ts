/**
 * A post that is live on a network. It comes from a sync of a connected account or is linked by hand
 * (URL or id), and points back to the content of the Fábrica it came from, when there is one.
 */

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };

export const MEDIA_TYPES = ['carousel', 'image', 'video', 'reel', 'story', 'text', 'other'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  carousel: 'Carrossel',
  image: 'Imagem',
  video: 'Vídeo',
  reel: 'Reels',
  story: 'Story',
  text: 'Texto',
  other: 'Outro',
};

export type PublicationSource = 'sync' | 'manual';

export interface Publication {
  id: string;
  platform: SocialPlatform;
  /** Id on the network. Manual links by URL may not have it until the next sync finds the post. */
  externalId: string | null;
  permalink: string | null;
  /** Connected account it was read from, or null when linked by hand. */
  connectionId: string | null;
  carouselId: string | null;
  /** Content registered by hand in Analytics (content made outside the Fábrica). */
  recordId: string | null;
  title: string;
  caption: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  /** ISO date-time it went live, when known. */
  publishedAt: string | null;
  source: PublicationSource;
  createdAt: string;
  updatedAt: string;
}

export type PublicationInput = Omit<Publication, 'id' | 'createdAt' | 'updatedAt'>;

export interface PublicationRef {
  platform: SocialPlatform;
  externalId: string | null;
  permalink: string | null;
}

const LIMITS = { title: 200, caption: 2200, url: 500, id: 80 } as const;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Networks whose site answers on www: the same post typed with or without it is one post. */
const WWW_HOSTS = ['instagram.com', 'tiktok.com', 'facebook.com'];

/**
 * "instagram.com/reel/Cx1/?igsh=..." → "https://www.instagram.com/p/Cx1/".
 * Query strings and fragments carry share tracking, never the identity of the post. On Instagram the
 * same shortcode opens under /p/, /reel/ and /tv/, so all of them become /p/ to match the synced post.
 */
export function normalizePermalink(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const bare = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const host = WWW_HOSTS.includes(bare) ? `www.${bare}` : url.hostname.toLowerCase();
    let path = url.pathname.replace(/\/+$/, '');
    if (bare === 'instagram.com') path = path.replace(/^\/(reels?|tv)\//, '/p/');
    return `https://${host}${path}/`;
  } catch {
    return null;
  }
}

/**
 * Reads what the user pasted: a post URL of Instagram, TikTok or Facebook, or a bare id for the platform chosen.
 * Returns null when it is neither.
 */
export function parsePublicationRef(raw: string, fallbackPlatform: SocialPlatform): PublicationRef | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^[\w-]{3,80}$/.test(value)) return { platform: fallbackPlatform, externalId: value, permalink: null };

  const permalink = normalizePermalink(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!permalink) return null;
  const { hostname, pathname } = new URL(permalink);

  if (/(^|\.)instagram\.com$/.test(hostname)) {
    return /^\/(p|reel|reels|tv)\/[\w-]+\/$/.test(pathname) ? { platform: 'instagram', externalId: null, permalink } : null;
  }
  if (/(^|\.)tiktok\.com$/.test(hostname)) {
    const video = pathname.match(/\/(?:video|photo)\/(\d{8,25})\/$/);
    if (video) return { platform: 'tiktok', externalId: video[1], permalink };
    return /^\/[\w-]+\/$/.test(pathname) && hostname.startsWith('vm.') ? { platform: 'tiktok', externalId: null, permalink } : null;
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(hostname)) {
    return { platform: 'facebook', externalId: null, permalink };
  }
  return null;
}

export function sanitizePublicationInput(raw: Partial<PublicationInput>): PublicationInput {
  const platform = SOCIAL_PLATFORMS.includes(raw.platform as SocialPlatform) ? (raw.platform as SocialPlatform) : 'instagram';
  const permalink = typeof raw.permalink === 'string' && raw.permalink ? normalizePermalink(raw.permalink) : null;
  const externalId = text(raw.externalId, LIMITS.id) || null;
  return {
    platform,
    externalId,
    permalink: permalink && permalink.length <= LIMITS.url ? permalink : null,
    connectionId: typeof raw.connectionId === 'string' && raw.connectionId ? raw.connectionId : null,
    carouselId: typeof raw.carouselId === 'string' && raw.carouselId ? raw.carouselId : null,
    recordId: typeof raw.recordId === 'string' && raw.recordId ? raw.recordId : null,
    title: text(raw.title, LIMITS.title),
    caption: text(raw.caption, LIMITS.caption),
    mediaType: MEDIA_TYPES.includes(raw.mediaType as MediaType) ? (raw.mediaType as MediaType) : 'other',
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' && /^https:\/\//.test(raw.thumbnailUrl) ? raw.thumbnailUrl.slice(0, 2000) : null,
    publishedAt: typeof raw.publishedAt === 'string' && !Number.isNaN(Date.parse(raw.publishedAt)) ? new Date(raw.publishedAt).toISOString() : null,
    source: raw.source === 'sync' ? 'sync' : 'manual',
  };
}

/** True when two references point to the same post: same platform and same id or same normalized URL. */
export function samePublication(a: PublicationRef, b: PublicationRef): boolean {
  if (a.platform !== b.platform) return false;
  if (a.externalId && b.externalId) return a.externalId === b.externalId;
  return Boolean(a.permalink && b.permalink && a.permalink === b.permalink);
}

/** Validation of a manual link before saving: one post links to one content. */
export function linkConflict(ref: PublicationRef, publications: Publication[], target: { carouselId: string | null; recordId: string | null }): Publication | null {
  return (
    publications.find(
      (item) => samePublication(item, ref) && ((item.carouselId && item.carouselId !== target.carouselId) || (item.recordId && item.recordId !== target.recordId)),
    ) ?? null
  );
}

export function publicationsOf(publications: Publication[], target: { carouselId?: string | null; recordId?: string | null }): Publication[] {
  return publications.filter((item) => (target.carouselId && item.carouselId === target.carouselId) || (target.recordId && item.recordId === target.recordId));
}
