import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TrackingService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import type { Project } from '../domain/project';
import { sameProject } from '../domain/project';
import { defaultUtm, newSlug, shortLink, trackedDestination, validateDestination, type TrackingLink, type Utm } from '../domain/tracking/tracking';
import type { ContentRecord } from '../domain/winners/record';
import { Alert, Button, Field, Input, Select } from '../ui/primitives';
import { CopyField } from './CopyField';

type Platform = NonNullable<TrackingLink['platform']>;
const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'outros', label: 'Outro' },
];

interface Props {
  project: Project;
  tracking: TrackingService;
  carousels: Carousel[];
  records: ContentRecord[];
  onCreated: (link: TrackingLink) => void;
}

/** One link per content and network: the short link counts clicks, the direct one carries the UTM to the page. */
export function LinkGenerator({ project, tracking, carousels, records, onCreated }: Props) {
  const contents = useMemo(
    () => [
      ...carousels.filter((carousel) => sameProject(carousel.project, project.name)).map((carousel) => ({ key: `c:${carousel.id}`, title: carousel.title })),
      ...records.filter((record) => !record.carouselId).map((record) => ({ key: `r:${record.id}`, title: record.title || 'Sem título' })),
    ],
    [carousels, records, project.name],
  );
  const [contentKey, setContentKey] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [destination, setDestination] = useState(project.landingUrl);
  const [campaign, setCampaign] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TrackingLink | null>(null);
  const content = contents.find((item) => item.key === contentKey) ?? null;
  const utm: Utm = defaultUtm({ platform, project: project.name, content: content?.title ?? label, campaign });

  const create = async () => {
    setError(null);
    if (!validateDestination(destination)) return setError('O destino precisa ser um endereço https (a landing page do projeto).');
    setBusy(true);
    try {
      const link = await tracking.createLink({
        projectId: project.id,
        slug: newSlug(),
        destination,
        platform,
        carouselId: contentKey.startsWith('c:') ? contentKey.slice(2) : null,
        recordId: contentKey.startsWith('r:') ? contentKey.slice(2) : null,
        publicationId: null,
        label: label || content?.title || '',
        utm,
        groupId: null,
      });
      setCreated(link);
      onCreated(link);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Conteúdo" htmlFor="link-content" className="lg:col-span-2">
          <Select id="link-content" value={contentKey} onChange={(e) => setContentKey(e.target.value)}>
            <option value="">Sem conteúdo (link da bio, campanha)</option>
            {contents.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rede" htmlFor="link-platform">
          <Select id="link-platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campanha (opcional)" htmlFor="link-campaign">
          <Input id="link-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder={project.name} />
        </Field>
        <Field label="Destino" htmlFor="link-destination" className="sm:col-span-2" hint={project.landingUrl ? undefined : 'Cadastra a landing page no projeto pra vir preenchido.'}>
          <Input id="link-destination" type="url" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Nome do link (opcional)" htmlFor="link-label" className="sm:col-span-2">
          <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: link da bio outubro" />
        </Field>
      </div>
      <p className="text-xs text-faint">
        UTM: utm_source=<span className="text-muted">{utm.source}</span> · utm_medium=<span className="text-muted">{utm.medium}</span> · utm_campaign=<span className="text-muted">{utm.campaign}</span> · utm_content=
        <span className="text-muted">{utm.content}</span>
      </p>
      <div>
        <Button variant="primary" loading={busy} onClick={() => void create()}>
          <Link2 className="size-4" aria-hidden /> Gerar link rastreável
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {created && (
        <div className="grid gap-3 rounded-2xl border border-line bg-canvas p-4 md:grid-cols-2">
          <CopyField label={tracking.available ? 'Link curto (conta o clique)' : 'Link curto (funciona com o login no Supabase)'} value={shortLink(tracking.shortLinkBase, created.slug)} />
          <CopyField label="Link direto com UTM (conta só a visita)" value={trackedDestination(created.destination, created.utm, created.slug)} />
        </div>
      )}
    </div>
  );
}
