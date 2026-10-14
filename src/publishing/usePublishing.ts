import { useCallback } from 'react';
import { useServices } from '../app/services';
import { useResource } from '../app/useResource';
import type { PublishingJob } from '../domain/publishing/job';
import type { SocialConnection } from '../domain/social/connection';

/** The publishing queue and the connected accounts that can receive posts. */
export function usePublishing() {
  const { publishing, social } = useServices();
  const jobs = useResource<PublishingJob[]>(useCallback(() => publishing.listJobs(), [publishing]), []);
  const connections = useResource<SocialConnection[]>(useCallback(() => social.listConnections(), [social]), []);
  const upsertJob = useCallback((job: PublishingJob) => jobs.setData((current) => [job, ...current.filter((item) => item.id !== job.id)]), [jobs]);
  return { publishing, jobs, connections, upsertJob };
}
