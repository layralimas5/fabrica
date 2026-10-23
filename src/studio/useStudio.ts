import { useCallback, useEffect } from 'react';
import type { StudioLink } from '../application/ports';
import { useServices } from '../app/services';
import { useResource } from '../app/useResource';
import type { PublishingJob } from '../domain/publishing/job';
import type { SocialConnection } from '../domain/social/connection';
import type { VideoJob } from '../domain/studio/videoJob';

/** While the studio has work in hand, the screen refreshes on its own at this pace. */
const LIVE_REFRESH_MS = 10_000;
const NO_LINK: StudioLink = { connected: false, createdAt: null, lastSeenAt: null, workerInfo: null };

/** Video requests, the studio link, the queue and the accounts that can receive videos. */
export function useStudio() {
  const { studio, publishing, social } = useServices();
  const jobs = useResource<VideoJob[]>(useCallback(() => studio.listJobs(), [studio]), []);
  const link = useResource<StudioLink>(useCallback(() => studio.link(), [studio]), NO_LINK);
  const queue = useResource<PublishingJob[]>(useCallback(() => (publishing.available ? publishing.listJobs() : Promise.resolve([])), [publishing]), []);
  const connections = useResource<SocialConnection[]>(useCallback(() => social.listConnections(), [social]), []);

  const busy = jobs.data.some((job) => job.status === 'queued' || job.status === 'working');
  const { reload: reloadJobs } = jobs;
  const { reload: reloadLink } = link;
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      void reloadJobs();
      void reloadLink();
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [busy, reloadJobs, reloadLink]);

  const upsertJob = useCallback((job: VideoJob) => jobs.setData((current) => [job, ...current.filter((item) => item.id !== job.id)]), [jobs]);
  const upsertQueued = useCallback((job: PublishingJob) => queue.setData((current) => [job, ...current.filter((item) => item.id !== job.id)]), [queue]);
  return { studio, jobs, link, queue, connections, upsertJob, upsertQueued };
}
