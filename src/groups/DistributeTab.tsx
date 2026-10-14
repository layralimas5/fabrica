import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { groupBlock, groupVersion, GROUP_POLICY_LABELS, linkComment, scheduleDays, type FacebookGroup, type GroupDistribution } from '../domain/groups/groups';
import { sameProject, type Project } from '../domain/project';
import { todayIso } from '../domain/schedule';
import { defaultUtm, newSlug, shortLink, trackedDestination, type TrackingLink } from '../domain/tracking/tracking';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '../ui/primitives';

interface Version {
  group: FacebookGroup;
  text: string;
  comment: string | null;
  link: TrackingLink | null;
  date: string;
}

interface Props {
  project: Project | null;
  groups: FacebookGroup[];
  distributions: GroupDistribution[];
  carousels: Carousel[];
  onSaved: (saved: GroupDistribution[], links: TrackingLink[]) => void;
}

function baseTextOf(carousel: Carousel): string {
  if (carousel.caption.trim()) return carousel.caption.trim();
  return carousel.slides
    .map((slide) => [slide.title, slide.body].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

/** One base content, a version per chosen group (rules, theme, link placement) and the days to post, ready for the checklist. */
export function DistributeTab({ project, groups, distributions, carousels, onSaved }: Props) {
  const services = useServices();
  const projectCarousels = useMemo(() => carousels.filter((carousel) => !project || sameProject(carousel.project, project.name)), [carousels, project]);
  const [carouselId, setCarouselId] = useState('');
  const [base, setBase] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [startDay, setStartDay] = useState(todayIso());
  const [perDay, setPerDay] = useState(2);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = groups.filter((group) => !group.archived);

  const pickCarousel = (id: string) => {
    setCarouselId(id);
    const carousel = projectCarousels.find((item) => item.id === id);
    if (carousel) {
      setBase(baseTextOf(carousel));
      setTitle(carousel.title);
    }
    setVersions(null);
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = async () => {
    setError(null);
    if (!base.trim()) return setError('Escreve o texto base ou escolhe um carrossel.');
    const chosen = active.filter((group) => selected.has(group.id));
    if (chosen.length === 0) return setError('Escolhe pelo menos um grupo.');
    const days = scheduleDays(startDay, chosen.length, perDay);
    const blocked = chosen.map((group, index) => ({ group, reason: groupBlock(group, distributions, days[index]) })).filter((entry) => entry.reason);
    if (blocked.length) return setError(blocked.map((entry) => `${entry.group.name}: ${entry.reason}`).join(' '));

    setBusy('generate');
    try {
      const built: Version[] = [];
      for (const [index, group] of chosen.entries()) {
        let link: TrackingLink | null = null;
        if (project?.landingUrl) {
          link = await services.tracking.createLink({
            projectId: project.id,
            slug: newSlug(),
            destination: project.landingUrl,
            platform: 'facebook',
            carouselId: carouselId || null,
            recordId: null,
            publicationId: null,
            label: `${title || 'Divulgação'} · ${group.name}`,
            utm: defaultUtm({ platform: 'facebook', project: project.name, content: title || 'divulgacao', groupName: group.name }),
            groupId: group.id,
          });
        }
        const url = link ? (services.tracking.available ? shortLink(services.tracking.shortLinkBase, link.slug) : trackedDestination(link.destination, link.utm, link.slug)) : null;
        built.push({ group, link, date: days[index], text: groupVersion({ base, group, index, link: url }), comment: url && group.linkInComments ? linkComment(url) : null });
      }
      setVersions(built);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!versions) return;
    setBusy('save');
    setError(null);
    try {
      const saved: GroupDistribution[] = [];
      for (const version of versions) {
        saved.push(
          await services.distributions.create({
            groupId: version.group.id,
            carouselId: carouselId || null,
            title: title || 'Divulgação',
            text: version.text,
            comment: version.comment ?? '',
            linkId: version.link?.id ?? null,
            date: version.date,
            status: 'pending',
            postUrl: '',
            publishedAt: null,
            results: { reactions: null, comments: null },
            notes: '',
          }),
        );
      }
      onSaved(saved, versions.flatMap((version) => (version.link ? [version.link] : [])));
      setVersions(null);
      setSelected(new Set());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!project?.landingUrl && <Alert tone="info">{project ? `${project.name} não tem landing page cadastrada: as versões saem sem link rastreável.` : 'Escolhe um projeto no topo pra cada grupo ganhar o seu link rastreável.'}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Conteúdo base" htmlFor="dist-carousel">
            <Select id="dist-carousel" value={carouselId} onChange={(e) => pickCarousel(e.target.value)}>
              <option value="">Texto livre</option>
              {projectCarousels.map((carousel) => (
                <option key={carousel.id} value={carousel.id}>
                  {carousel.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Título (interno)" htmlFor="dist-title">
            <Input id="dist-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Roteiro Lisboa" />
          </Field>
          <Field label="Texto base" htmlFor="dist-base" hint="Cada grupo recebe uma abertura diferente e o link do jeito que as regras permitem. Dá pra editar cada versão depois.">
            <Textarea id="dist-base" rows={7} value={base} onChange={(e) => setBase(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Começar em" htmlFor="dist-start">
              <Input id="dist-start" type="date" value={startDay} min={todayIso()} onChange={(e) => e.target.value && setStartDay(e.target.value)} />
            </Field>
            <Field label="Grupos por dia" htmlFor="dist-per-day" hint="Espalhar evita parecer spam.">
              <Input id="dist-per-day" type="number" min={1} max={10} value={perDay} onChange={(e) => setPerDay(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
            </Field>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">Grupos ({selected.size} escolhidos)</legend>
          {active.length === 0 && <p className="text-sm text-muted">Cadastra os grupos na aba Grupos.</p>}
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
            {active.map((group) => {
              const reason = groupBlock(group, distributions, startDay);
              return (
                <li key={group.id}>
                  <label className={clsx('flex cursor-pointer gap-3 rounded-xl border p-3', selected.has(group.id) ? 'border-accent bg-accent/5' : 'border-line', group.policy === 'forbidden' && 'cursor-not-allowed opacity-60')}>
                    <input type="checkbox" checked={selected.has(group.id)} disabled={group.policy === 'forbidden'} onChange={() => toggle(group.id)} className="mt-1 size-4 accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{group.name}</span>
                        <Badge tone={group.policy === 'allowed' ? 'success' : 'warning'}>{GROUP_POLICY_LABELS[group.policy]}</Badge>
                      </span>
                      {group.rules && <span className="mt-1 line-clamp-2 block text-xs text-muted">{group.rules}</span>}
                      {reason && <span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">{reason}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
      <div>
        <Button variant="primary" loading={busy === 'generate'} onClick={() => void generate()}>
          <Sparkles className="size-4" aria-hidden /> Gerar versões por grupo
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}

      {versions && (
        <section aria-label="Versões" className="flex flex-col gap-4">
          <ul className="grid gap-4 lg:grid-cols-2">
            {versions.map((version, index) => (
              <li key={version.group.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{version.group.name}</p>
                  <Input
                    type="date"
                    aria-label={`Dia de postar em ${version.group.name}`}
                    value={version.date}
                    onChange={(e) => setVersions((current) => current && current.map((item, position) => (position === index ? { ...item, date: e.target.value || item.date } : item)))}
                    className="!h-8 !w-auto"
                  />
                </div>
                <label className="sr-only" htmlFor={`version-${index}`}>
                  Texto para {version.group.name}
                </label>
                <Textarea
                  id={`version-${index}`}
                  rows={8}
                  value={version.text}
                  onChange={(e) => setVersions((current) => current && current.map((item, position) => (position === index ? { ...item, text: e.target.value } : item)))}
                />
                {version.comment && <p className="break-all text-xs text-muted">Primeiro comentário: {version.comment}</p>}
                {version.group.rules && <p className="text-[11px] text-faint">Regras: {version.group.rules}</p>}
              </li>
            ))}
          </ul>
          <div>
            <Button variant="primary" loading={busy === 'save'} onClick={() => void save()}>
              Salvar {versions.length} na checklist
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
