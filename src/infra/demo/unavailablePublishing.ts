import type { PublishingService } from '../../application/ports';
import type { PublishingJob } from '../../domain/publishing/job';

const NEEDS_SERVER = 'Publicar pelas APIs precisa do modo com login (Supabase) e de uma conta conectada. No modo local, use a publicação assistida.';

/** Local mode: no queue at all, so nothing can look scheduled when it is not. */
export class UnavailablePublishing implements PublishingService {
  readonly available = false;
  async listJobs(): Promise<PublishingJob[]> {
    return [];
  }
  createJob(): Promise<PublishingJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  approve(): Promise<PublishingJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  cancel(): Promise<PublishingJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  retry(): Promise<PublishingJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  processNow(): Promise<{ processed: number }> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
}
