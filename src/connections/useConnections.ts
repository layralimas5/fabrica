import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { SocialConfig, SocialConnection, SyncRun } from '../domain/social/connection';

export type ConfigState = { kind: 'loading' } | { kind: 'local' } | { kind: 'missing'; message: string } | { kind: 'ready'; config: SocialConfig };

/** Connections, their sync history and the server configuration, loaded together for the Contas conectadas screen. */
export function useConnections() {
  const { social } = useServices();
  const [config, setConfig] = useState<ConfigState>({ kind: 'loading' });
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, history] = await Promise.all([social.listConnections(), social.listRuns(50)]);
      setConnections(list);
      setRuns(history);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [social]);

  useEffect(() => {
    void reload();
    if (!social.available) {
      setConfig({ kind: 'local' });
      return;
    }
    social
      .config()
      .then((value) => setConfig({ kind: 'ready', config: value }))
      .catch((cause: unknown) => setConfig({ kind: 'missing', message: errorMessage(cause) }));
  }, [social, reload]);

  return { social, config, connections, runs, loading, error, setError, reload };
}
