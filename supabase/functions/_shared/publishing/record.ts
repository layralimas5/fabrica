import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { logError } from '../http.ts';
import { normalizePermalink, titleFromCaption } from '../social/permalink.ts';
import type { MediaType, SocialPlatform } from '../social/types.ts';

/** What a published job leaves in the Painel: a publication linked to its carousel or studio video. */
export interface PublishedPost {
  userId: string;
  connectionId: string;
  platform: SocialPlatform;
  externalId: string | null;
  permalink: string | null;
  mediaType: MediaType;
  title: string;
  caption: string;
  carouselId: string | null;
  videoJobId: string | null;
}

/** The new post enters the Painel linked to its content; the next sync fills in its numbers. */
export async function recordPublication(db: SupabaseClient, post: PublishedPost): Promise<void> {
  if (post.externalId) {
    const data = {
      platform: post.platform,
      externalId: post.externalId,
      permalink: normalizePermalink(post.permalink),
      connectionId: post.connectionId,
      carouselId: post.carouselId,
      videoJobId: post.videoJobId,
      recordId: null,
      title: post.title || titleFromCaption(post.caption),
      caption: post.caption,
      mediaType: post.mediaType,
      thumbnailUrl: null,
      publishedAt: new Date().toISOString(),
      source: 'sync',
    };
    // The unique index on external ids is partial, so this is "find, then insert" instead of an upsert.
    const { data: existing } = await db.from('publications').select('id').eq('user_id', post.userId).eq('platform', post.platform).eq('external_id', post.externalId).maybeSingle();
    const row = { user_id: post.userId, platform: post.platform, external_id: post.externalId, permalink: data.permalink, connection_id: post.connectionId, carousel_id: post.carouselId, published_at: data.publishedAt, source: 'sync', data };
    const { error } = existing ? await db.from('publications').update(row).eq('id', existing.id) : await db.from('publications').insert(row);
    if (error) logError('record publication', error);
  }
  if (post.carouselId) {
    const { error } = await db.from('carousels').update({ status: 'published' }).eq('id', post.carouselId).eq('user_id', post.userId).in('status', ['draft', 'editing', 'ready']);
    if (error) logError('mark carousel published', error);
  }
}
