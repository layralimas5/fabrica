import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrackingService } from '../../application/ports';
import { sanitizeLinkInput } from '../../domain/tracking/links';
import { sanitizeTouch, TRACKING_EVENTS, type TrackingEvent, type TrackingEventName, type TrackingLink, type TrackingLinkInput } from '../../domain/tracking/tracking';
import { fail } from './supabaseServices';
import { invokeFunction } from './supabaseSocial';

interface LinkRow {
  id: string;
  project_id: string;
  slug: string;
  destination: string;
  platform: TrackingLink['platform'];
  carousel_id: string | null;
  record_id: string | null;
  publication_id: string | null;
  data: { label?: string; utm?: TrackingLink['utm']; groupId?: string | null };
  created_at: string;
}

const rowToLink = (row: LinkRow): TrackingLink => ({
  ...sanitizeLinkInput({
    projectId: row.project_id,
    slug: row.slug,
    destination: row.destination,
    platform: row.platform,
    carouselId: row.carousel_id,
    recordId: row.record_id,
    publicationId: row.publication_id,
    label: row.data?.label,
    utm: row.data?.utm,
    groupId: row.data?.groupId ?? null,
  }),
  id: row.id,
  createdAt: row.created_at,
});

interface EventRow {
  id: number;
  project_id: string;
  name: string;
  link_id: string | null;
  visitor_id: string | null;
  verified: boolean;
  first_touch: unknown;
  last_touch: unknown;
  occurred_at: string;
}

const PAGE = 1000;
const MAX_EVENTS = 50_000;

export class SupabaseTracking implements TrackingService {
  readonly available = true;
  readonly endpoint: string;

  constructor(
    private readonly client: SupabaseClient,
    supabaseUrl: string,
    readonly shortLinkBase: string,
  ) {
    this.endpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/track`;
  }

  async listLinks(): Promise<TrackingLink[]> {
    const { data, error } = await this.client.from('tracking_links').select('*').order('created_at', { ascending: false });
    if (error) fail('Não consegui carregar os links rastreáveis', error);
    return (data as LinkRow[]).map(rowToLink);
  }

  async createLink(raw: TrackingLinkInput): Promise<TrackingLink> {
    const input = sanitizeLinkInput(raw);
    const { data, error } = await this.client
      .from('tracking_links')
      .insert({
        project_id: input.projectId,
        slug: input.slug,
        destination: input.destination,
        platform: input.platform,
        carousel_id: input.carouselId,
        record_id: input.recordId,
        publication_id: input.publicationId,
        data: { label: input.label, utm: input.utm, groupId: input.groupId },
      })
      .select()
      .single();
    if (error) fail('Não consegui criar o link', error);
    return rowToLink(data as LinkRow);
  }

  async removeLink(id: string): Promise<void> {
    const { error } = await this.client.from('tracking_links').delete().eq('id', id);
    if (error) fail('Não consegui excluir o link', error);
  }

  async listEvents(sinceDay: string): Promise<TrackingEvent[]> {
    const events: TrackingEvent[] = [];
    for (let from = 0; from < MAX_EVENTS; from += PAGE) {
      const { data, error } = await this.client
        .from('tracking_events')
        .select('id, project_id, name, link_id, visitor_id, verified, first_touch, last_touch, occurred_at')
        .gte('occurred_at', `${sinceDay}T00:00:00-03:00`)
        .order('occurred_at')
        .range(from, from + PAGE - 1);
      if (error) fail('Não consegui carregar os eventos', error);
      for (const row of data as EventRow[]) {
        if (!TRACKING_EVENTS.includes(row.name as TrackingEventName)) continue;
        events.push({
          id: row.id,
          projectId: row.project_id,
          name: row.name as TrackingEventName,
          linkId: row.link_id,
          visitorId: row.visitor_id,
          verified: row.verified,
          firstTouch: sanitizeTouch(row.first_touch),
          lastTouch: sanitizeTouch(row.last_touch),
          occurredAt: row.occurred_at,
        });
      }
      if ((data as EventRow[]).length < PAGE) break;
    }
    return events;
  }

  async rotateSecret(projectId: string): Promise<string> {
    const { secret } = await invokeFunction<{ secret: string }>(this.client, 'track', { action: 'rotate-secret', projectId });
    return secret;
  }

  async deleteEvents(projectId: string): Promise<void> {
    const { error } = await this.client.from('tracking_events').delete().eq('project_id', projectId);
    if (error) fail('Não consegui apagar os eventos', error);
  }
}
