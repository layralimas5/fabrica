import { useCallback, useEffect, useState } from 'react';

export interface Resource<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (update: (current: T) => T) => void;
}

/** Loads a list (or value) once and exposes it with explicit loading/error states. */
export function useResource<T>(loader: () => Promise<T>, initial: T): Resource<T> {
  const [data, setState] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await loader());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setData = useCallback((update: (current: T) => T) => setState(update), []);
  return { data, loading, error, reload, setData };
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
