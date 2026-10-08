import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { videoTools } from '../app/videoTools';
import type { VoiceOption } from '../application/video/ports';
import { groupVoices, type VoiceGroup } from '../domain/video/voices';

function displayNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'language' });
  } catch {
    return null;
  }
}

/** Every voice of the service, grouped by language and country. */
export function useVoiceCatalog() {
  const { auth } = useServices();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    videoTools(auth)
      .speech.listVoices()
      .then((list) => active && setVoices(list))
      .catch((cause: unknown) => active && setError(errorMessage(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [auth]);

  const groups = useMemo<VoiceGroup[]>(() => groupVoices(voices, displayNames()), [voices]);
  return { groups, loading, error };
}
