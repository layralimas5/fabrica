import { ExternalLink, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import {
  linkConflict,
  parsePublicationRef,
  publicationsOf,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type Publication,
  type SocialPlatform,
} from '../domain/social/publication';
import { Alert, Badge, Button, Dialog, Field, Input, Select } from '../ui/primitives';

interface LinkTarget {
  carouselId: string | null;
  recordId: string | null;
  title: string;
  platform: SocialPlatform;
}

interface Props {
  target: LinkTarget | null;
  publications: Publication[];
  onClose: () => void;
  onChange: (update: (current: Publication[]) => Publication[]) => void;
}

/**
 * Links a post that is live (URL or id) to the content it came from, so its numbers and conversions
 * are read for that content. Works for posts published outside the Fábrica too.
 */
export function LinkPublicationDialog({ target, publications, onClose, onChange }: Props) {
  const services = useServices();
  const [value, setValue] = useState('');
  const [platform, setPlatform] = useState<SocialPlatform>(target?.platform ?? 'instagram');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  const linked = publicationsOf(publications, target);

  const save = async () => {
    setError(null);
    const ref = parsePublicationRef(value, platform);
    if (!ref) return setError('Não reconheci. Cola o link do post (Instagram, TikTok ou Facebook) ou o id dele.');
    const conflict = linkConflict(ref, publications, target);
    if (conflict) return setError(`Esse post já está ligado a outro conteúdo${conflict.title ? ` (${conflict.title})` : ''}.`);
    const existing = publications.find((item) => (ref.externalId && item.externalId === ref.externalId) || (ref.permalink && item.permalink === ref.permalink));
    setBusy(true);
    try {
      const input = { ...(existing ?? {}), ...ref, carouselId: target.carouselId, recordId: target.recordId, title: existing?.title || target.title };
      const saved = existing
        ? await services.publications.update(existing.id, { ...existing, ...input })
        : await services.publications.create({ ...input, connectionId: null, caption: '', mediaType: 'other', thumbnailUrl: null, publishedAt: null, source: 'manual' });
      onChange((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setValue('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (publication: Publication) => {
    setError(null);
    try {
      if (publication.source === 'sync') {
        // Synced posts stay (their numbers keep coming); only the link to this content goes.
        const saved = await services.publications.update(publication.id, { ...publication, carouselId: null, recordId: null });
        onChange((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      } else {
        await services.publications.remove(publication.id);
        onChange((current) => current.filter((item) => item.id !== publication.id));
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <Dialog
      open
      title="Vincular publicação"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Liga <strong className="text-ink">{target.title || 'este conteúdo'}</strong> ao post que está no ar. Com a conta conectada, as métricas desse post entram sozinhas na próxima sincronização.
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Link ou id do post" htmlFor="publication-ref" className="flex-1">
            <Input id="publication-ref" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://www.instagram.com/p/…" autoComplete="off" />
          </Field>
          <Field label="Rede (para id)" htmlFor="publication-platform">
            <Select id="publication-platform" value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)}>
              {SOCIAL_PLATFORMS.map((item) => (
                <option key={item} value={item}>
                  {SOCIAL_PLATFORM_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()}>
            <Link2 className="size-4" aria-hidden /> Vincular
          </Button>
        </form>
        {error && <Alert>{error}</Alert>}

        {linked.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {linked.map((publication) => (
              <li key={publication.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <Badge tone={publication.source === 'sync' ? 'success' : 'neutral'}>{SOCIAL_PLATFORM_LABELS[publication.platform]}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted">{publication.permalink ?? `id ${publication.externalId}`}</span>
                {publication.permalink && (
                  <a href={publication.permalink} target="_blank" rel="noreferrer" aria-label="Abrir o post" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
                <Button variant="ghost" size="sm" aria-label="Desvincular" onClick={() => void unlink(publication)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
