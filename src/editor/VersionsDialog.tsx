import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage, useResource } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { MAX_VERSION_LABEL, versionInput, versionsToPrune, type ContentVersion } from '../domain/contentVersion';
import { Alert, Button, Dialog, EmptyState, Input, Spinner } from '../ui/primitives';

interface Props {
  carousel: Carousel;
  onClose: () => void;
  onRestore: (version: ContentVersion) => void;
}

/** Saves the carousel as it is now and brings back any saved version (the current one is saved first, so nothing is lost). */
export function VersionsDialog({ carousel, onClose, onRestore }: Props) {
  const { contentVersions } = useServices();
  const versions = useResource<ContentVersion[]>(useCallback(() => contentVersions.listFor(carousel.id), [contentVersions, carousel.id]), []);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCurrent = async (name: string) => {
    const saved = await contentVersions.create(versionInput(carousel, name));
    const all = [saved, ...versions.data];
    const pruned = versionsToPrune(all, carousel.id);
    for (const id of pruned) await contentVersions.remove(id);
    versions.setData(() => all.filter((version) => !pruned.includes(version.id)));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const restore = (version: ContentVersion) =>
    run(async () => {
      if (!window.confirm(`Voltar para "${version.label}"? A versão atual é guardada antes.`)) return;
      await saveCurrent('Antes de restaurar');
      onRestore(version);
      onClose();
    });

  const remove = (version: ContentVersion) =>
    run(async () => {
      await contentVersions.remove(version.id);
      versions.setData((current) => current.filter((item) => item.id !== version.id));
    });

  return (
    <Dialog open title="Versões" onClose={onClose} size="lg">
      <form
        className="mb-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await saveCurrent(label);
            setLabel('');
          });
        }}
      >
        <label htmlFor="version-label" className="sr-only">
          Nome da versão
        </label>
        <Input id="version-label" value={label} maxLength={MAX_VERSION_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder="Nome da versão (opcional), ex.: gancho de dor" />
        <Button type="submit" variant="primary" loading={busy}>
          <Save className="size-4" aria-hidden /> Salvar versão atual
        </Button>
      </form>
      {(error ?? versions.error) && (
        <div className="mb-4">
          <Alert>{error ?? versions.error}</Alert>
        </div>
      )}
      {versions.loading ? (
        <Spinner />
      ) : versions.data.length === 0 ? (
        <EmptyState title="Nenhuma versão salva" description="Salva uma versão antes de testar outro gancho ou CTA, e volta pra ela quando quiser." />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {versions.data.map((version) => (
            <li key={version.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{version.label}</p>
                <p className="truncate text-xs text-muted">
                  {new Date(version.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {version.snapshot.slides.length} slides · “{version.snapshot.slides[0]?.title ?? version.snapshot.title}”
                </p>
              </div>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void restore(version)}>
                <RotateCcw className="size-3.5" aria-hidden /> Restaurar
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Excluir ${version.label}`} disabled={busy} onClick={() => void remove(version)}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
