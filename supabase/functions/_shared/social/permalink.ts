/** Mirror of normalizePermalink in src/domain/social/publication.ts: keep both in sync. */

const WWW_HOSTS = ['instagram.com', 'tiktok.com', 'facebook.com'];

export function normalizePermalink(raw: string | null): string | null {
  if (!raw) return null;
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

/** First line of the caption, short: the title a synced post gets until it is linked to a content. */
export function titleFromCaption(caption: string): string {
  const line = caption.split('\n').find((item) => item.trim())?.trim() ?? '';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
