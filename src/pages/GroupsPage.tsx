import clsx from 'clsx';
import { ExternalLink, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAccountScope } from '../app/accountScope';
import { useAssets, useBrandKits, useCarousels } from '../app/data';
import { renderContextFor } from '../app/renderContextFor';
import { useServices } from '../app/services';
import { errorMessage, useResource } from '../app/useResource';
import { brandForCarousel } from '../domain/brandKit';
import { emptyGroup, GROUP_POLICY_LABELS, lastPostDay, sanitizeDistributionInput, type FacebookGroup, type GroupDistribution, type GroupDistributionInput } from '../domain/groups/groups';
import { ChecklistTab } from '../groups/ChecklistTab';
import { DistributeTab } from '../groups/DistributeTab';
import { GroupDialog } from '../groups/GroupDialog';
import { useTracking } from '../tracking/useTracking';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';

const TABS = [
  { id: 'groups', label: 'Grupos' },
  { id: 'distribute', label: 'Divulgar' },
  { id: 'checklist', label: 'Checklist e calendário' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function GroupsPage() {
  const services = useServices();
  const scope = useAccountScope();
  const carousels = useCarousels();
  const brands = useBrandKits();
  const assets = useAssets();
  const { links, events } = useTracking();
  const groups = useResource<FacebookGroup[]>(useCallback(() => services.groups.list(), [services.groups]), []);
  const distributions = useResource<GroupDistribution[]>(useCallback(() => services.distributions.list(), [services.distributions]), []);
  const [tab, setTab] = useState<Tab>('groups');
  const [editing, setEditing] = useState<{ group: FacebookGroup | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = scope.project;
  const scoped = groups.data.filter((group) => !project || group.projectId === project.id);
  const groupIds = new Set(scoped.map((group) => group.id));
  const scopedDistributions = distributions.data.filter((item) => groupIds.has(item.groupId));

  if (groups.loading || distributions.loading || carousels.loading || scope.loading) return <Spinner />;

  const saveDistribution = async (item: GroupDistribution, patch: Partial<GroupDistributionInput>) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = item;
    const saved = await services.distributions.update(item.id, sanitizeDistributionInput({ ...input, ...patch }));
    distributions.setData((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
  };

  const download = async (carouselId: string) => {
    const carousel = carousels.data.find((item) => item.id === carouselId);
    const brand = carousel ? brandForCarousel(carousel, brands.data, scope.accounts) : null;
    if (!carousel || !brand) throw new Error('Carrossel ou marca não encontrados.');
    const { exportZip } = await import('../app/exportCarousel');
    await exportZip(renderContextFor(carousel, brand, assets.data, services.assets, scope.accounts), carousel, 'jpg', () => undefined);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Grupos do Facebook"
        description={`Divulgação assistida${project ? ` de ${project.name}` : ''} em grupos de terceiros: uma versão por grupo, respeitando as regras, com link rastreável de cada um. Você posta; a Fábrica prepara e acompanha.`}
        action={
          <Button variant="primary" onClick={() => setEditing({ group: null })}>
            <Plus className="size-4" aria-hidden /> Novo grupo
          </Button>
        }
      />
      <div className="mb-6">
        <Alert tone="info">A Groups API do Facebook foi descontinuada: nada aqui publica sozinho nem lê métricas dos grupos. Poste com respeito às regras de cada comunidade e sem repetir o mesmo texto.</Alert>
      </div>
      {(error ?? groups.error ?? distributions.error) && (
        <div className="mb-4">
          <Alert>{error ?? groups.error ?? distributions.error}</Alert>
        </div>
      )}

      <div role="tablist" aria-label="Seções" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', tab === item.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'groups' &&
        (scoped.length === 0 ? (
          <EmptyState title="Nenhum grupo cadastrado" description="Cadastra os grupos onde faz sentido divulgar, com as regras de cada um." action={<Button onClick={() => setEditing({ group: null })}>Cadastrar grupo</Button>} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scoped.map((group) => {
              const last = lastPostDay(distributions.data, group.id);
              return (
                <li key={group.id}>
                  <article className={clsx('flex h-full flex-col rounded-2xl border border-line bg-surface p-4', group.archived && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-ink">{group.name}</h2>
                      <Badge tone={group.policy === 'allowed' ? 'success' : group.policy === 'forbidden' ? 'neutral' : 'warning'}>{GROUP_POLICY_LABELS[group.policy]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">{[group.category, group.theme].filter(Boolean).join(' · ') || 'Sem categoria'}</p>
                    {group.rules && <p className="mt-2 line-clamp-3 text-xs text-faint">{group.rules}</p>}
                    <p className="mt-2 text-xs text-muted">
                      {last ? `Último post: ${last.split('-').reverse().join('/')}` : 'Nenhum post ainda'} · intervalo de {group.minDaysBetween} dias
                    </p>
                    <div className="mt-auto flex gap-2 pt-4">
                      <Button variant="secondary" size="sm" onClick={() => setEditing({ group })}>
                        Editar
                      </Button>
                      <a href={group.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        Abrir <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'distribute' && (
        <DistributeTab
          project={project}
          groups={scoped}
          distributions={distributions.data}
          carousels={carousels.data}
          onSaved={(saved, created) => {
            distributions.setData((current) => [...saved, ...current]);
            links.setData((current) => [...created, ...current]);
            setTab('checklist');
          }}
        />
      )}

      {tab === 'checklist' && <ChecklistTab groups={scoped} distributions={scopedDistributions} links={links.data} events={events.data} onSave={saveDistribution} onDownload={download} />}

      {editing && (
        <GroupDialog
          key={editing.group?.id ?? 'new'}
          initial={editing.group ? { ...editing.group } : emptyGroup(project?.id ?? null)}
          editing={editing.group}
          projects={scope.projects}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing.group ? await services.groups.update(editing.group.id, input) : await services.groups.create(input);
            groups.setData((current) => (editing.group ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current]));
            setEditing(null);
          }}
          onDelete={
            editing.group
              ? async () => {
                  const group = editing.group as FacebookGroup;
                  setError(null);
                  try {
                    // The local mode has no cascade: the group's distributions go first.
                    for (const item of distributions.data.filter((entry) => entry.groupId === group.id)) await services.distributions.remove(item.id);
                    await services.groups.remove(group.id);
                    groups.setData((current) => current.filter((item) => item.id !== group.id));
                    distributions.setData((current) => current.filter((item) => item.groupId !== group.id));
                    setEditing(null);
                  } catch (cause) {
                    setError(errorMessage(cause));
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
