import type { StudioLink, StudioService } from '../../application/ports';
import type { PublishingJob } from '../../domain/publishing/job';
import type { VideoJob } from '../../domain/studio/videoJob';

const NEEDS_SERVER = 'O estúdio de vídeos precisa do modo com login (Supabase): é por lá que o PC pega os pedidos e devolve os vídeos.';

/** Local mode: no studio queue, so nothing can look queued when it is not. */
export class UnavailableStudio implements StudioService {
  readonly available = false;
  async listJobs(): Promise<VideoJob[]> {
    return [];
  }
  createJob(): Promise<VideoJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  updateJob(): Promise<VideoJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  cancel(): Promise<VideoJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  requeue(): Promise<VideoJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  fileUrl(): Promise<string> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  async link(): Promise<StudioLink> {
    return { connected: false, createdAt: null, lastSeenAt: null, workerInfo: null };
  }
  createKey(): Promise<string> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  revokeKey(): Promise<void> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
  schedule(): Promise<PublishingJob> {
    return Promise.reject(new Error(NEEDS_SERVER));
  }
}
