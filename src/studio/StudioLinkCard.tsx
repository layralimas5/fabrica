import { KeyRound, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import type { StudioLink, StudioService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import { timeAgo } from '../domain/social/connection';
import { studioOnline } from '../domain/studio/videoJob';
import { CopyField } from '../tracking/CopyField';
import { Alert, Badge, Button } from '../ui/primitives';

interface Props {
  studio: StudioService;
  link: StudioLink;
  onChanged: () => void;
}

/** Whether the PC is talking to the Fábrica, and the key that lets it (shown once, right after creating). */
export function StudioLinkCard({ studio, link, onChanged }: Props) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = studioOnline(link.lastSeenAt, new Date());

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const createKey = () =>
    run(async () => {
      if (link.connected && !window.confirm('Trocar a chave desliga o estúdio que usa a chave atual até você colar a nova no .env dele. Continuar?')) return;
      setKey(await studio.createKey());
    });

  const revoke = () =>
    run(async () => {
      if (!window.confirm('Desligar o estúdio? Ele para de pegar pedidos e de enviar vídeos para o YouTube.')) return;
      await studio.revokeKey();
      setKey(null);
    });

  return (
    <section aria-labelledby="studio-link-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-muted" aria-hidden>
            <MonitorSmartphone className="size-4" />
          </span>
          <div>
            <h2 id="studio-link-title" className="text-sm font-semibold text-ink">
              Estúdio no PC
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {!link.connected && 'Ainda não ligado. Gere a chave e rode o estúdio no PC (pessoais/estudio-videos).'}
              {link.connected && (online ? `Online, visto ${timeAgo(link.lastSeenAt, new Date())}` : `Offline, visto ${timeAgo(link.lastSeenAt, new Date())}. Os pedidos esperam na fila até o PC ligar.`)}
              {link.workerInfo?.machine && ` · ${link.workerInfo.machine}`}
              {link.workerInfo?.channels?.length ? ` · canais: ${link.workerInfo.channels.join(', ')}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {link.connected && <Badge tone={online ? 'success' : 'neutral'}>{online ? 'Online' : 'Offline'}</Badge>}
          <Button size="sm" loading={busy} onClick={() => void createKey()} disabled={!studio.available}>
            <KeyRound className="size-3.5" aria-hidden /> {link.connected ? 'Trocar chave' : 'Gerar chave'}
          </Button>
          {link.connected && (
            <Button size="sm" variant="danger" onClick={() => void revoke()} disabled={busy}>
              Desligar
            </Button>
          )}
        </div>
      </div>

      {key && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-subtle/60 p-4">
          <Alert tone="info">Essa chave aparece só agora. Cola no arquivo .env do estúdio; se perder, gere outra.</Alert>
          <CopyField label="Linha para o .env do estúdio" value={`FABRICA_STUDIO_KEY=${key}`} />
          <CopyField label="Depois, no terminal do estúdio" value="npm run estudio" />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  );
}
