import { createStore, get, set } from 'idb-keyval';
import type { TrackingService } from '../../application/ports';
import { sanitizeLinkInput } from '../../domain/tracking/links';
import type { TrackingEvent, TrackingLink, TrackingLinkInput } from '../../domain/tracking/tracking';

const store = createStore('fabrica-carrosseis-demo', 'kv');
const KEY = 'local:trackingLinks';
const NEEDS_SERVER = 'Eventos e links curtos precisam do modo com login (Supabase): é lá que a função track recebe os cliques e as visitas.';

/** Local mode keeps the links (with their UTM), so the direct UTM link already works; no event ever arrives here. */
export class LocalTracking implements TrackingService {
  readonly available = false;
  readonly endpoint = null;

  constructor(readonly shortLinkBase: string) {}

  async listLinks(): Promise<TrackingLink[]> {
    return (await get<TrackingLink[]>(KEY, store)) ?? [];
  }

  async createLink(input: TrackingLinkInput): Promise<TrackingLink> {
    const link: TrackingLink = { ...sanitizeLinkInput(input), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    await set(KEY, [link, ...(await this.listLinks())], store);
    return link;
  }

  async removeLink(id: string): Promise<void> {
    await set(KEY, (await this.listLinks()).filter((link) => link.id !== id), store);
  }

  async listEvents(): Promise<TrackingEvent[]> {
    return [];
  }

  rotateSecret(): Promise<string> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }

  async deleteEvents(): Promise<void> {
    // No event is ever stored in local mode.
  }
}
