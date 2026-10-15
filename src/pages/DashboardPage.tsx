import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { recordForContent } from '../application/recordForContent';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { BarList } from '../charts/BarList';
import { LineChart } from '../charts/LineChart';
import { ContentDetail } from '../dashboard/ContentDetail';
import { Card, ContentThumb, KpiCard, SourceBadge } from '../dashboard/parts';
import { useDashboardData } from '../dashboard/useDashboardData';
import { accountLabel } from '../domain/account';
import { buildDashboard, compactNumber, dailySeries, DASH_PERIOD_LABELS, DASH_PERIODS, percent, rankBy, type DashFilters, type DashPeriod } from '../domain/dashboard/dashboard';
import { DASH_PLATFORM_LABELS, itemEngagement, type DashItem, type DashPlatform } from '../domain/dashboard/items';
import { sameProject } from '../domain/project';
import { todayIso } from '../domain/schedule';
import { timeAgo } from '../domain/social/connection';
import { POST_METRIC_LABELS, type PostMetricKey } from '../domain/social/metrics';
import { Alert, Button, EmptyState, Input, PageHeader, Select, Spinner } from '../ui/primitives';
import { ContentConversions } from '../tracking/ContentConversions';
import { useTracking } from '../tracking/useTracking';
import { useWinnerActions } from '../winners/useWinnerActions';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';
import { change as changeOf } from '../domain/dashboard/dashboard';
import { countStage, eventsInRange, measuredStagesOf, type TrackingEventName } from '../domain/tracking/tracking';

const CONVERSION_LABELS = { click: 'Cliques nos links', lp_view: 'Visitas à LP', quiz_start: 'Inícios do quiz', quiz_complete: 'Quiz concluído', signup: 'Cadastros' } as const;
const CONVERSION_DEFINITIONS = {
  click: 'Cliques nos links curtos da Fábrica, registrados no servidor antes de a página abrir. Prévias de link (WhatsApp, Instagram) não contam. Clique não é visita: a página pode nem carregar.',
  lp_view: 'Visitas registradas pelo snippet na landing page. A mesma pessoa conta uma vez quando deu consentimento; visitas anônimas contam uma a uma.',
  quiz_start: "Pessoas que começaram o quiz (evento fabrica.track('quiz_start')).",
  quiz_complete: "Pessoas que terminaram o quiz (evento fabrica.track('quiz_complete')).",
  signup: 'Cadastros enviados pelo app. Os confirmados vêm do servidor com o segredo do projeto.',
} as const;
const CONVERSION_SETUP = { click: 'gere links curtos', lp_view: 'instale o snippet', quiz_start: 'evento do quiz', quiz_complete: 'evento do quiz', signup: 'evento do cadastro' } as const;
const PLATFORM_FILTERS: (DashPlatform | 'all')[] = ['all', 'instagram', 'facebook', 'tiktok', 'outros'];
const SERIES_METRICS: PostMetricKey[] = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'];

const DEFINITIONS = {
  views: 'Soma das visualizações dos posts publicados no período, até a última leitura. Instagram e Facebook contam exibições (inclui repetições); TikTok conta reproduções. Não é o mesmo que alcance.',
  reach: 'Soma do alcance (pessoas ou contas únicas, estimativa da Meta) dos posts do período. O TikTok não informa alcance. Somar alcance de vários posts conta a mesma pessoa mais de uma vez.',
  likes: 'Curtidas (no Facebook, todas as reações) dos posts publicados no período.',
  comments: 'Comentários dos posts publicados no período.',
  shares: 'Compartilhamentos dos posts publicados no período.',
  saves: 'Salvamentos. Só o Instagram informa; nas outras redes fica indisponível.',
  engagement: '(curtidas + comentários + compartilhamentos + salvamentos) ÷ visualizações, somando os posts que têm visualizações e pelo menos uma interação. Salvamentos entram só onde a rede informa.',
  publications: 'Posts publicados no período (data de publicação), sincronizados ou registrados à mão.',
  followers: 'Último número de seguidores lido de cada conta conectada no período, somado. O ganho só aparece para contas lidas pelo menos duas vezes dentro do período.',
};

export function DashboardPage() {
  const scope = useAccountScope();
  const data = useDashboardData(scope.projects);
  const tracking = useTracking();
  const services = useServices();
  const library = useWinnerLibrary();
  const actions = useWinnerActions(library);
  const [reapplying, setReapplying] = useState(false);
  const [reapplyError, setReapplyError] = useState<string | null>(null);
  const today = todayIso();
  const [filters, setFilters] = useState<Omit<DashFilters, 'project'>>({ platform: 'all', accountKey: null, period: '30', from: '', to: '' });
  const [seriesMetric, setSeriesMetric] = useState<PostMetricKey>('views');
  const [selected, setSelected] = useState<DashItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const full: DashFilters = { ...filters, project: scope.project?.name ?? null };

  const reapply = async (item: DashItem, mode: 'model' | 'variations') => {
    setReapplying(true);
    setReapplyError(null);
    try {
      const { record, created } = await recordForContent(services, item, { records: library.records.data, carousels: data.carousels.data, accounts: data.accounts.data, publications: data.publications.data });
      if (created) library.records.setData((current) => [record, ...current]);
      actions.run(mode, record);
    } catch (cause) {
      setReapplyError(errorMessage(cause));
    } finally {
      setReapplying(false);
    }
  };

  const scopedConnections = useMemo(
    () => data.social.connections.filter((connection) => !scope.project || connection.projectId === scope.project.id || (connection.accountId && scope.matches(connection.accountId))),
    [data.social.connections, scope],
  );
  const followerConnections = useMemo(() => {
    const byPlatform = filters.platform === 'all' ? scopedConnections : scopedConnections.filter((connection) => connection.platform === filters.platform);
    const byAccount = filters.accountKey
      ? byPlatform.filter((connection) => filters.accountKey === `acc:${connection.accountId}` || filters.accountKey === `conn:${connection.id}`)
      : byPlatform;
    return new Set(byAccount.map((connection) => connection.id));
  }, [scopedConnections, filters.platform, filters.accountKey]);

  const summary = useMemo(
    () => buildDashboard(data.items, full, today, data.social.accounts, followerConnections),
    [data.items, full.project, full.platform, full.accountKey, full.period, full.from, full.to, today, data.social.accounts, followerConnections], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const series = useMemo(() => dailySeries(summary.items, seriesMetric, summary.ranges.current), [summary, seriesMetric]);
  const accountOptions = useMemo(() => accountChoices(data.items, scope, data.social.connections), [data.items, scope, data.social.connections]);
  const projectEvents = useMemo(() => tracking.events.data.filter((event) => !scope.project || event.projectId === scope.project.id), [tracking.events.data, scope.project]);
  const measured = useMemo(() => measuredStagesOf(projectEvents, tracking.tracking.available && tracking.links.data.length > 0), [projectEvents, tracking.tracking.available, tracking.links.data.length]);
  const conversionKpi = (name: TrackingEventName) => {
    if (!measured.has(name)) return null;
    const now = countStage(eventsInRange(projectEvents, summary.ranges.current.from, summary.ranges.current.to), name);
    const before = countStage(eventsInRange(projectEvents, summary.ranges.previous.from, summary.ranges.previous.to), name);
    return { value: now, previous: before, change: changeOf(now, before), covered: now, total: now };
  };
  const lastSync = scopedConnections.map((connection) => connection.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;

  if (data.loading || scope.loading) return <Spinner label="Montando o painel" />;
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));
  const thumb = (item: DashItem, className?: string) => <ContentThumb item={item} carousels={data.carousels.data} brands={data.brands.data} assets={data.assets.data} accounts={data.accounts.data} className={className} />;
  const availableSeries = SERIES_METRICS.filter((key) => summary.kpis[key].covered > 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Painel"
        description={`${scope.project ? `${scope.project.name}: d` : 'D'}esempenho real dos posts publicados, com a fonte de cada número.`}
        action={<SyncButton connections={scopedConnections} syncing={syncing} setSyncing={setSyncing} onDone={(message) => { setSyncMessage(message); void data.reload(); }} />}
      />

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Período" options={DASH_PERIODS.map((period) => ({ value: period, label: DASH_PERIOD_LABELS[period] }))} value={filters.period} onChange={(period) => set({ period: period as DashPeriod })} />
          {filters.period === 'custom' && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="dash-from">De</label>
              <Input id="dash-from" type="date" value={filters.from} max={filters.to || today} onChange={(e) => set({ from: e.target.value })} className="!h-9 !w-auto" />
              <span className="text-xs text-faint">até</span>
              <label className="sr-only" htmlFor="dash-to">Até</label>
              <Input id="dash-to" type="date" value={filters.to} min={filters.from} max={today} onChange={(e) => set({ to: e.target.value })} className="!h-9 !w-auto" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Rede" options={PLATFORM_FILTERS.map((platform) => ({ value: platform, label: platform === 'all' ? 'Todas' : DASH_PLATFORM_LABELS[platform] }))} value={filters.platform} onChange={(platform) => set({ platform: platform as DashFilters['platform'], accountKey: null })} />
          <label className="sr-only" htmlFor="dash-account">Conta</label>
          <Select id="dash-account" value={filters.accountKey ?? ''} onChange={(e) => set({ accountKey: e.target.value || null })} className="!h-9 !w-auto max-w-64">
            <option value="">Todas as contas</option>
            {accountOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-faint">
          {summary.ranges.current.from.split('-').reverse().join('/')} a {summary.ranges.current.to.split('-').reverse().join('/')} · comparado com os {summary.ranges.current.days} dias anteriores ·{' '}
          {summary.sources.api} {summary.sources.api === 1 ? 'post' : 'posts'} via API{lastSync ? ` (última sincronização ${timeAgo(lastSync, new Date())})` : ''} · {summary.sources.manual} lançados à mão
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {data.error && <Alert>{data.error}</Alert>}
        {syncMessage && <Alert tone="info">{syncMessage}</Alert>}
        {!data.available && <Alert tone="info">Modo local: o painel mostra só o que foi lançado à mão. Com o login (Supabase) e as contas conectadas, os números passam a vir das APIs oficiais.</Alert>}
        {data.available && data.social.connections.length === 0 && (
          <Alert tone="info">
            Nenhuma conta conectada ainda: os números abaixo são os lançados à mão. <Link to="/conexoes" className="font-medium underline underline-offset-4">Conectar contas</Link>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <KpiCard label="Visualizações" kpi={summary.kpis.views} format={compactNumber} definition={DEFINITIONS.views} />
        <KpiCard label="Alcance" kpi={summary.kpis.reach} format={compactNumber} definition={DEFINITIONS.reach} />
        <KpiCard label="Taxa de engajamento" kpi={summary.engagement} format={(value) => percent(value, 2)} definition={DEFINITIONS.engagement} />
        <KpiCard label="Publicações" kpi={summary.publications} format={(value) => value.toLocaleString('pt-BR')} definition={DEFINITIONS.publications} note={`${summary.publications.previous ?? 0} no período anterior`} />
        <KpiCard label="Curtidas" kpi={summary.kpis.likes} format={compactNumber} definition={DEFINITIONS.likes} />
        <KpiCard label="Comentários" kpi={summary.kpis.comments} format={compactNumber} definition={DEFINITIONS.comments} />
        <KpiCard label="Compartilhamentos" kpi={summary.kpis.shares} format={compactNumber} definition={DEFINITIONS.shares} />
        <KpiCard label="Salvamentos" kpi={summary.kpis.saves} format={compactNumber} definition={DEFINITIONS.saves} />
        <KpiCard
          label="Seguidores"
          kpi={{ value: summary.followers.total, previous: null, change: null, covered: summary.followers.accounts, total: summary.followers.accounts }}
          format={compactNumber}
          definition={DEFINITIONS.followers}
          unavailable="Conecte uma conta"
          note={summary.followers.total === null ? 'só com conta conectada' : `${summary.followers.accounts} ${summary.followers.accounts === 1 ? 'conta' : 'contas'}${summary.followers.gained !== null ? ` · ${summary.followers.gained >= 0 ? '+' : ''}${summary.followers.gained.toLocaleString('pt-BR')} no período` : ''}`}
        />
      </div>

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-faint">Conversões rastreadas{scope.project ? ` de ${scope.project.name}` : ''}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(['click', 'lp_view', 'quiz_start', 'quiz_complete', 'signup'] as const).map((name) => (
          <KpiCard
            key={name}
            label={CONVERSION_LABELS[name]}
            kpi={conversionKpi(name)}
            format={(value) => value.toLocaleString('pt-BR')}
            definition={CONVERSION_DEFINITIONS[name]}
            unavailable="Não medido"
            note={measured.has(name) ? 'pessoas no período (projeto inteiro)' : CONVERSION_SETUP[name]}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">
        Os filtros de rede e conta não se aplicam aqui: as conversões vêm dos eventos das páginas e apps. O funil completo e a atribuição por link estão em{' '}
        <Link to="/conversoes" className="underline underline-offset-4">Conversões</Link>.
      </p>

      {summary.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nenhum post publicado nesse período"
            description="Marca os carrosséis como postados, registra os posts de fora no Analytics ou conecta as contas pra sincronizar."
            action={<Link to="/conteudos" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Ver conteúdos</Link>}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card
              title="Evolução no período"
              action={
                availableSeries.length > 1 && (
                  <Segmented label="Métrica" small options={availableSeries.map((key) => ({ value: key, label: POST_METRIC_LABELS[key] }))} value={seriesMetric} onChange={(key) => setSeriesMetric(key as PostMetricKey)} />
                )
              }
            >
              {summary.kpis[seriesMetric].covered === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Nenhum post do período tem {POST_METRIC_LABELS[seriesMetric].toLowerCase()}.</p>
              ) : (
                <>
                  <LineChart points={series.map((point) => ({ day: point.day, value: point.value, marker: point.published }))} label={POST_METRIC_LABELS[seriesMetric]} markerLabel="Publicações no dia" format={compactNumber} height={300} />
                  <p className="mt-2 text-[11px] text-faint">Total acumulado dos posts do período pela data de cada leitura. As barrinhas embaixo são as publicações de cada dia.</p>
                </>
              )}
            </Card>
            <Card title="Melhores conteúdos">
              <Ranking title="Maior engajamento" entries={rankBy(summary.items, 'engagement')} format={(value) => percent(value, 1)} onOpen={setSelected} thumb={thumb} empty="Nenhum post com 100+ visualizações ainda." />
              <div className="my-4 border-t border-line" />
              <Ranking title="Mais visualizações" entries={rankBy(summary.items, 'views')} format={compactNumber} onOpen={setSelected} thumb={thumb} empty="Nenhum post com visualizações." />
            </Card>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card title="Comparação por rede">
              <BarList
                rows={summary.byPlatform.map((row) => ({ key: row.key, label: DASH_PLATFORM_LABELS[row.key as DashPlatform], value: row.views, detail: `${row.contents} ${row.contents === 1 ? 'post' : 'posts'}${row.engagement !== null ? ` · ${percent(row.engagement)} eng.` : ''}` }))}
                format={compactNumber}
                emptyLabel="sem visualizações"
              />
              <p className="mt-3 text-[11px] text-faint">Barras = visualizações. Cada rede mede visualização do seu jeito (veja o ícone de informação nos cards).</p>
            </Card>
            <Card title="Distribuição por formato">
              <BarList rows={summary.byFormat.map((row) => ({ key: row.key, label: row.key, value: row.contents, detail: row.views !== null ? `${compactNumber(row.views)} visualizações` : undefined }))} format={(value) => `${value} ${value === 1 ? 'post' : 'posts'}`} />
            </Card>
          </div>

          <Card title={`Publicações (${summary.items.length})`} className="mt-6">
            <PublicationsTable items={summary.items} onOpen={setSelected} thumb={thumb} />
          </Card>
        </>
      )}

      <ContentDetail
        item={selected}
        onClose={() => setSelected(null)}
        carousels={data.carousels.data}
        brands={data.brands.data}
        assets={data.assets.data}
        accounts={data.accounts.data}
        conversions={
          selected && (
            <>
              {reapplyError && <Alert>{reapplyError}</Alert>}
              <ContentConversions item={selected} links={tracking.links.data} events={tracking.events.data} shortLinkBase={tracking.tracking.shortLinkBase} />
            </>
          )
        }
        reapplying={reapplying}
        onReapply={(mode) => selected && void reapply(selected, mode)}
      />
      {actions.dialogs}
    </div>
  );
}

function accountChoices(items: DashItem[], scope: ReturnType<typeof useAccountScope>, connections: ReturnType<typeof useDashboardData>['social']['connections']) {
  const keys = new Set(items.filter((item) => !scope.project || sameProject(item.project, scope.project.name)).map((item) => item.accountKey).filter((key): key is string => Boolean(key)));
  return [...keys]
    .map((key) => {
      const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (kind === 'acc') {
        const account = scope.accounts.find((item) => item.id === id);
        return { key, label: account ? accountLabel(account) : 'Conta removida' };
      }
      if (kind === 'conn') {
        const connection = connections.find((item) => item.id === id);
        return { key, label: connection ? `@${connection.username || connection.externalId} · ${DASH_PLATFORM_LABELS[connection.platform]}` : 'Conexão removida' };
      }
      return { key, label: id };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function Segmented({ label, options, value, onChange, small = false }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; small?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-subtle p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            small ? 'h-7 px-2 text-[11px]' : 'h-8 px-3 text-xs',
            value === option.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Ranking({ title, entries, format, onOpen, thumb, empty }: { title: string; entries: ReturnType<typeof rankBy>; format: (value: number) => string; onOpen: (item: DashItem) => void; thumb: (item: DashItem, className?: string) => ReactNode; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-faint">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entries.map(({ item, value }, index) => (
            <li key={item.key}>
              <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span className="w-4 text-xs tabular-nums text-faint">{index + 1}</span>
                {thumb(item, 'size-9')}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{item.title}</span>
                  <span className="block text-[11px] text-faint">{DASH_PLATFORM_LABELS[item.platform]}</span>
                </span>
                <span className="text-sm font-medium tabular-nums text-ink">{format(value)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const TABLE_METRICS: PostMetricKey[] = ['views', 'reach', 'likes', 'comments', 'shares', 'saves'];

function PublicationsTable({ items, onOpen, thumb }: { items: DashItem[]; onOpen: (item: DashItem) => void; thumb: (item: DashItem, className?: string) => ReactNode }) {
  // A column no post of the period has would only show dashes.
  const columns = TABLE_METRICS.filter((key) => items.some((item) => item.metrics[key] !== undefined));
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
            <th scope="col" className="py-2 pr-3 font-medium">Conteúdo</th>
            <th scope="col" className="px-2 py-2 font-medium">Data</th>
            {columns.map((key) => (
              <th key={key} scope="col" className="px-2 py-2 text-right font-medium">
                {POST_METRIC_LABELS[key]}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-medium">Eng.</th>
            <th scope="col" className="py-2 pl-2 font-medium">Fonte</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const engagement = itemEngagement(item.metrics);
            return (
              <tr key={item.key} className="border-b border-line/70 last:border-0 hover:bg-subtle/60">
                <td className="py-2 pr-3">
                  <button type="button" onClick={() => onOpen(item)} className="flex max-w-72 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {thumb(item, 'size-9')}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{item.title}</span>
                      <span className="block text-[11px] text-faint">
                        {DASH_PLATFORM_LABELS[item.platform]} · {item.formatLabel}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted">{item.publishedDay ? item.publishedDay.split('-').reverse().slice(0, 2).join('/') : '—'}</td>
                {columns.map((key) => (
                  <td key={key} className="px-2 py-2 text-right tabular-nums text-ink">
                    {item.metrics[key] === undefined ? <span className="text-faint">—</span> : compactNumber(item.metrics[key] as number)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums text-ink">{engagement === null ? <span className="text-faint">—</span> : percent(engagement)}</td>
                <td className="py-2 pl-2">
                  <SourceBadge source={item.source} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-faint">— = a métrica não existe para esse post (a rede não informa ou não foi lançada). Nunca é zero. Colunas sem nenhum dado no período ficam ocultas.</p>
    </div>
  );
}

function SyncButton({ connections, syncing, setSyncing, onDone }: { connections: ReturnType<typeof useDashboardData>['social']['connections']; syncing: boolean; setSyncing: (value: boolean) => void; onDone: (message: string) => void }) {
  const { social } = useServices();
  const ready = connections.filter((connection) => connection.status === 'connected');
  if (!social.available || ready.length === 0) return null;
  const run = async () => {
    setSyncing(true);
    const problems: string[] = [];
    let posts = 0;
    for (const connection of ready) {
      try {
        const result = await social.sync(connection.id);
        posts += result.publications;
        if (result.error) problems.push(`@${connection.username}: ${result.error}`);
      } catch (cause) {
        problems.push(`@${connection.username}: ${errorMessage(cause)}`);
      }
    }
    setSyncing(false);
    onDone(problems.length ? `Sincronizado com avisos (${posts} posts lidos). ${problems.join(' · ')}` : `Sincronizado: ${posts} posts lidos de ${ready.length} ${ready.length === 1 ? 'conta' : 'contas'}.`);
  };
  return (
    <Button variant="secondary" loading={syncing} onClick={() => void run()}>
      {!syncing && <RefreshCw className="size-4" aria-hidden />} Sincronizar agora
    </Button>
  );
}
