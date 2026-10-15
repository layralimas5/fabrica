import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { errorMessage } from '../app/useResource';
import { FunnelBars } from '../charts/FunnelBars';
import { Card } from '../dashboard/parts';
import { useDashboardData } from '../dashboard/useDashboardData';
import { buildDashboard, compactNumber, dashRanges, type DashPeriod } from '../domain/dashboard/dashboard';
import { todayIso } from '../domain/schedule';
import {
  ATTRIBUTION_LABELS,
  biggestDrop,
  buildFunnel,
  eventsInRange,
  FUNNEL_STAGE_LABELS,
  measuredStagesOf,
  resultsByLink,
  shortLink,
  trackedDestination,
  TRACKING_EVENT_LABELS,
  type AttributionModel,
} from '../domain/tracking/tracking';
import { CopyField } from '../tracking/CopyField';
import { InstallGuide } from '../tracking/InstallGuide';
import { LinkGenerator } from '../tracking/LinkGenerator';
import { useTracking } from '../tracking/useTracking';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';

const PERIODS: DashPeriod[] = ['7', '30', '90'];
const MISSING_HINT: Record<string, string> = {
  click: 'gere um link curto pra contar cliques',
  lp_view: 'instale o snippet na landing page',
  quiz_start: "chame fabrica.track('quiz_start') no quiz",
  quiz_complete: "chame fabrica.track('quiz_complete') no fim do quiz",
  signup: 'envie o cadastro pelo servidor do app',
  subscription: 'envie a assinatura pelo servidor do app',
};

export function ConversionsPage() {
  const scope = useAccountScope();
  const project = scope.project;
  const dashboard = useDashboardData(scope.projects);
  const { tracking, links, events } = useTracking();
  const [period, setPeriod] = useState<DashPeriod>('30');
  const [model, setModel] = useState<AttributionModel>('last');
  const [tab, setTab] = useState<'links' | 'install'>('links');
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const range = dashRanges({ period, from: '', to: '' }, today).current;

  const projectEvents = useMemo(() => events.data.filter((event) => !project || event.projectId === project.id), [events.data, project]);
  const projectLinks = useMemo(() => links.data.filter((link) => !project || link.projectId === project.id), [links.data, project]);
  const periodEvents = useMemo(() => eventsInRange(projectEvents, range.from, range.to), [projectEvents, range.from, range.to]);
  const views = useMemo(
    () => buildDashboard(dashboard.items, { project: project?.name ?? null, platform: 'all', accountKey: null, period, from: '', to: '' }, today, [], null).kpis.views.value,
    [dashboard.items, project, period, today],
  );
  const funnel = useMemo(() => buildFunnel(periodEvents, views, measuredStagesOf(projectEvents, tracking.available && projectLinks.length > 0)), [periodEvents, views, projectEvents, projectLinks.length]);
  const worst = biggestDrop(funnel);
  const results = useMemo(() => resultsByLink(periodEvents, projectLinks, model), [periodEvents, projectLinks, model]);
  const unconfirmedSignups = periodEvents.filter((event) => event.name === 'signup' && !event.verified).length;

  if (scope.loading || links.loading || events.loading || dashboard.loading) return <Spinner label="Lendo o funil" />;

  const removeLink = async (id: string) => {
    if (!window.confirm('Excluir esse link? Quem clicar nele depois cai numa página de link não encontrado.')) return;
    setError(null);
    try {
      await tracking.removeLink(id);
      links.setData((current) => current.filter((link) => link.id !== id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const contentTitle = (link: (typeof projectLinks)[number]) =>
    link.label || dashboard.carousels.data.find((carousel) => carousel.id === link.carouselId)?.title || dashboard.records.data.find((record) => record.id === link.recordId)?.title || 'Link sem conteúdo';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Conversões" description="Do conteúdo à assinatura: links rastreáveis, eventos reais das landing pages e dos apps, e onde o funil perde mais gente." />
      {(error ?? links.error ?? events.error) && (
        <div className="mb-4">
          <Alert>{error ?? links.error ?? events.error}</Alert>
        </div>
      )}
      {!tracking.available && (
        <div className="mb-6">
          <Alert tone="info">Modo local: dá pra gerar links com UTM, mas cliques, visitas e cadastros só chegam com o login no Supabase e a função track publicada.</Alert>
        </div>
      )}

      <Card
        title={`Funil${project ? ` de ${project.name}` : ' de todos os projetos'}`}
        action={
          <div role="radiogroup" aria-label="Período" className="flex gap-1 rounded-xl bg-subtle p-1">
            {PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={period === value}
                onClick={() => setPeriod(value)}
                className={clsx('h-7 rounded-lg px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', period === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
              >
                {value} dias
              </button>
            ))}
          </div>
        }
      >
        <FunnelBars
          steps={funnel.map((step) => ({ key: step.stage, label: FUNNEL_STAGE_LABELS[step.stage], value: step.value, fromPrevious: step.fromPrevious, missing: step.stage === 'views' ? 'sem visualizações no período' : MISSING_HINT[step.stage] }))}
          worstKey={worst?.stage ?? null}
          format={compactNumber}
        />
        <div className="mt-4 flex flex-col gap-1 text-xs text-muted">
          {worst && worst.fromPrevious !== null ? (
            <p>
              <strong className="font-medium text-ink">Maior perda:</strong> só {(worst.fromPrevious * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% chegam a “{FUNNEL_STAGE_LABELS[worst.stage]}”. É a etapa pra olhar primeiro.
            </p>
          ) : (
            <p>Ainda não há duas etapas medidas no período pra comparar.</p>
          )}
          <p className="text-faint">
            Pessoas por etapa: a mesma pessoa conta uma vez (quando deu consentimento); eventos anônimos e cliques contam um a um. Cliques são registrados no link curto, antes da página abrir, e não são visitas. A
            primeira etapa é de visualizações, outra unidade: a porcentagem dela pros cliques é a taxa de clique.
            {unconfirmedSignups > 0 && ` ${unconfirmedSignups} cadastro(s) vieram do navegador, sem confirmação do servidor.`}
          </p>
        </div>
      </Card>

      {!project ? (
        <div className="mt-6">
          <EmptyState
            title="Escolhe um projeto pra gerar links"
            description="Os links, o snippet e o segredo do servidor são de cada projeto. Usa o seletor Projeto no topo."
            action={
              <Link to="/projetos" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
                Ver projetos
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Seções" className="mt-8 flex gap-1 border-b border-line">
            {(['links', 'install'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', tab === value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
              >
                {value === 'links' ? 'Links rastreáveis' : 'Instalar nas páginas'}
              </button>
            ))}
          </div>

          {tab === 'links' ? (
            <div className="mt-6 flex flex-col gap-6">
              <Card title="Gerar link">
                <LinkGenerator
                  key={project.id}
                  project={project}
                  tracking={tracking}
                  carousels={dashboard.carousels.data}
                  records={dashboard.records.data}
                  onCreated={(link) => links.setData((current) => [link, ...current])}
                />
              </Card>
              <Card
                title={`Links de ${project.name} (${projectLinks.length})`}
                action={
                  <div role="radiogroup" aria-label="Atribuição" className="flex gap-1 rounded-xl bg-subtle p-1">
                    {(['last', 'first'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={model === value}
                        onClick={() => setModel(value)}
                        className={clsx('h-7 rounded-lg px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', model === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
                      >
                        {ATTRIBUTION_LABELS[value]}
                      </button>
                    ))}
                  </div>
                }
              >
                {projectLinks.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum link ainda. Gera um por conteúdo e por rede pra saber qual post traz gente.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {results.map(({ link, counts }) => (
                      <li key={link.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{contentTitle(link)}</p>
                            <p className="text-xs text-faint">
                              {link.utm.source} · {link.utm.campaign} · criado em {new Date(link.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <dl className="flex flex-wrap gap-4 text-right text-xs">
                            {(['click', 'lp_view', 'quiz_complete', 'signup', 'subscription'] as const).map((name) => (
                              <div key={name}>
                                <dt className="text-faint">{TRACKING_EVENT_LABELS[name]}</dt>
                                <dd className="text-sm font-semibold tabular-nums text-ink">{counts[name]}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                          <CopyField label="Link curto" value={shortLink(tracking.shortLinkBase, link.slug)} />
                          <CopyField label="Link direto com UTM" value={trackedDestination(link.destination, link.utm, link.slug)} />
                          <Button variant="ghost" size="sm" aria-label={`Excluir link ${contentTitle(link)}`} onClick={() => void removeLink(link.id)}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : (
            <div className="mt-6">
              <Card title={`Instalar em ${project.name}`}>
                <InstallGuide project={project} tracking={tracking} onEventsDeleted={() => void events.reload()} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
