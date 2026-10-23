/** Mirror of normalizePermalink in src/domain/social/publication.ts: keep both in sync. */

const WWW_HOSTS = ['instagram.com', 'tiktok.com', 'facebook.com'];

export function normalizePermalink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const bare = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (bare === 'youtu.be' || bare === 'youtube.com') {
      const id = youtubeVideoId(url, bare);
      return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }
    const host = WWW_HOSTS.includes(bare) ? `www.${bare}` : url.hostname.toLowerCase();
    let path = url.pathname.replace(/\/+$/, '');
    if (bare === 'instagram.com') path = path.replace(/^\/(reels?|tv)\//, '/p/');
    return `https://${host}${path}/`;
  } catch {
    return null;
  }
}

/** youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>, /live/<id>: the video id, which is all the identity there is. */
function youtubeVideoId(url: URL, bare: string): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const id = bare === 'youtu.be' ? segments[0] : segments[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(segments[0] ?? '') ? segments[1] : null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** First line of the caption, short: the title a synced post gets until it is linked to a content. */
export function titleFromCaption(caption: string): string {
  const line = caption.split('\n').find((item) => item.trim())?.trim() ?? '';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
