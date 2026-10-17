import { ExternalLink, Layers, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useAccountScope } from '../app/accountScope';
import { useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage, useResource } from '../app/useResource';
import { saveProject } from '../application/saveProject';
import { CONVERSION_GOAL_LABELS, emptyProject, projectCounts, sameProject, STARTER_PROJECTS, toProjectInput, unregisteredProjectNames, type Project } from '../domain/project';
import { ProjectDialog } from '../projects/ProjectDialog';
import type { SocialConnection } from '../domain/social/connection';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';

export function BrandProjectsPage() {
  const services = useServices();
  const scope = useAccountScope();
  const carousels = useCarousels();
  const brands = useBrandKits();
  const connections = useResource<SocialConnection[]>(useCallback(() => services.social.listConnections(), [services.social]), []);
  const [editing, setEditing] = useState<{ project: Project | null; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = scope.projects;

  const unregistered = useMemo(
    () => unregisteredProjectNames(projects, [...scope.accounts.map((account) => account.project), ...carousels.data.map((carousel) => carousel.project)]),
    [projects, scope.accounts, carousels.data],
  );
  const starters = STARTER_PROJECTS.filter((starter) => !projects.some((project) => sameProject(project.name, starter.name)));

  if (scope.loading || carousels.loading || brands.loading) return <Spinner />;

  /** One click per name: Momentumm, Lumad and Aura, or names already typed in accounts and carousels. */
  const createMany = async (names: { name: string; color?: string; description?: string }[]) => {
    setBusy(true);
    setError(null);
    try {
      const known = [...projects];
      for (const item of names) known.push(await saveProject(services, { ...emptyProject(item.name), color: item.color ?? '#5b4bff', description: item.description ?? '' }, null, known));
      await scope.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const countsOf = (project: Project) => projectCounts(project, scope.accounts, connections.data, carousels.data);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Projetos"
        description="As marcas e apps próprios. Cada projeto junta as contas, os conteúdos, os links rastreáveis e o funil de conversão."
        action={
          <Button variant="primary" onClick={() => setEditing({ project: null })}>
            <Plus className="size-4" aria-hidden /> Novo projeto
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {(starters.length > 0 || unregistered.length > 0) && (
        <section aria-label="Começar rápido" className="mb-8 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm font-semibold text-ink">Começar rápido</p>
          <p className="mt-1 text-sm text-muted">Cria os projetos de uma vez. Contas e carrosséis que já usam esses nomes entram sozinhos no projeto.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {starters.length > 0 && (
              <Button variant="secondary" loading={busy} onClick={() => void createMany(starters)}>
                Criar {starters.map((starter) => starter.name).join(', ')}
              </Button>
            )}
            {unregistered.length > 0 && (
              <Button variant="secondary" loading={busy} onClick={() => void createMany(unregistered.map((name) => ({ name })))}>
                Importar {unregistered.length === 1 ? `"${unregistered[0]}"` : `${unregistered.length} nomes já usados`}
              </Button>
            )}
          </div>
        </section>
      )}

      {projects.length === 0 ? (
        <EmptyState title="Nenhum projeto ainda" description="Cadastra Momentumm, Lumad, Aura ou qualquer marca nova pra ver tudo de cada uma num lugar só." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const counts = countsOf(project);
            const brand = brands.data.find((kit) => kit.id === project.brandKitId);
            return (
              <li key={project.id}>
                <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-sm">
                  <header className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: project.color }} aria-hidden>
                      <Layers className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold tracking-tight text-ink">{project.name}</h2>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{project.description || 'Sem descrição.'}</p>
                    </div>
                    {project.status === 'paused' && <Badge>Pausado</Badge>}
                  </header>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-faint">Contas</dt>
                      <dd className="font-medium text-ink">{counts.accounts}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-faint">Conteúdos</dt>
                      <dd className="font-medium text-ink">{counts.contents}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-faint">Conversão</dt>
                      <dd className="font-medium text-ink">{CONVERSION_GOAL_LABELS[project.conversionGoal]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-faint">Identidade</dt>
                      <dd className="truncate font-medium text-ink">{brand?.name ?? '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                    <Button variant="secondary" size="sm" onClick={() => setEditing({ project })}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => scope.setProject(project.id)} disabled={scope.project?.id === project.id}>
                      {scope.project?.id === project.id ? 'Projeto atual' : 'Usar como atual'}
                    </Button>
                    {project.landingUrl && (
                      <a
                        href={project.landingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        Landing page <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ProjectDialog
          key={editing.project?.id ?? 'new'}
          initial={editing.project ? toProjectInput(editing.project) : emptyProject(editing.name)}
          editing={editing.project}
          brands={brands.data}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await saveProject(services, input, editing.project, projects);
            await Promise.all([scope.reload(), carousels.reload()]);
            setEditing(null);
          }}
          onDelete={
            editing.project
              ? async () => {
                  const project = editing.project as Project;
                  await services.projects.remove(project.id);
                  if (scope.project?.id === project.id) scope.setProject(null);
                  await scope.reload();
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
