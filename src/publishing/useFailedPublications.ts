import { useEffect, useState } from 'react';
import { useServices } from '../app/services';

const REFRESH_MS = 5 * 60 * 1000;

/** Count of failed posts in the queue, shown on the Calendário link so a failure never goes unnoticed. */
export function useFailedPublications(): number {
  const { publishing } = useServices();
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (!publishing.available) return;
    let active = true;
    const load = () =>
      publishing
        .listJobs()
        .then((jobs) => active && setFailed(jobs.filter((job) => job.status === 'failed').length))
        .catch((error: unknown) => console.warn('Fila de publicação indisponível:', error instanceof Error ? error.message : error));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [publishing]);

  return failed;
}
