import clsx from 'clsx';
import { ClipboardCopy, Lightbulb, Sparkles, Wand2 } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAccountScope } from '../app/accountScope';
import { useServices } from '../app/services';
import { errorMessage, useResource } from '../app/useResource';
import { recordForContent } from '../application/recordForContent';
import { ContentDetail } from '../dashboard/ContentDetail';
import { Card, ContentThumb } from '../dashboard/parts';
import { useDashboardData } from '../dashboard/useDashboardData';
import { buildDashboard, compactNumber, dashRanges, percent, type DashPeriod } from '../domain/dashboard/dashboard';
import type { DashItem } from '../domain/dashboard/items';
import { DASH_PLATFORM_LABELS } from '../domain/dashboard/items';
import type { AiInsight } from '../domain/intelligence/insight';
import { analysisBriefing, COMPARE_KEYS, COMPARE_LABELS, compareGroups, contentResults, findings, rankResults, weeklySummary, type CompareKey, type ContentResult, type RankKey } from '../domain/intelligence/intelligence';
import { todayIso } from '../domain/schedule';
import { eventsInRange, measuredStagesOf } from '../domain/tracking/tracking';
import { ContentConversions } from '../tracking/ContentConversions';
import { copyText, useTracking } from '../tracking/useTracking';
import { Alert, Badge, Button, PageHeader, Select, Spinner } from '../ui/primitives';
import { useWinnerActions } from '../winners/useWinnerActions';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';

const PERIODS: DashPeriod[] = ['7', '30', '90'];
const RANKS: { key: RankKey; title: string; empty: string; format: (result: ContentResult) => string }[] = [
  { key: 'engagement', title: 'Melhor engajamento', empty: 'Nenhum conteúdo com 100+ visualizações e interações no período.', format: (result) => percent(result.engagement ?? 0) },
  { key: 'clicks', title: 'Mais cliques rastreados', empty: 'Nenhum clique rastreado: gere links rastreáveis para os conteúdos.', format: (result) => `${result.clicks} cliques` },
  { key: 'signups', title: 'Mais cadastros', empty: 'Nenhum cadastro atribuído a um conteúdo ainda.', format: (result) => `${result.signups} cadastros` },
];

export function IntelligencePage() {
  const services = useServices();
  const scope = useAccountScope();
  const data = useDashboardData(scope.projects);
  const { links, events, tracking } = useTracking();
  const library = useWinnerLibrary();
  const actions = useWinnerActions(library);
  const insights = useResource<AiInsight[]>(useCallback(() => services.insights.list(), [services.insights]), []);
  const [period, setPeriod] = useState<DashPeriod>('30');
  const [compareKey, setCompareKey] = useState<CompareKey>('hookType');
  const [versionTarget, setVersionTarget] = useState('');
  const [selected, setSelected] = useState<DashItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const project = scope.project;

  const projectEvents = useMemo(() => events.data.filter((event) => !project || event.projectId === project.id), [events.data, project]);
  const projectLinks = useMemo(() => links.data.filter((link) => !project || link.projectId === project.id), [links.data, project]);
  const measured = useMemo(() => measuredStagesOf(projectEvents, tracking.available && projectLinks.length > 0), [projectEvents, tracking.available, projectLinks.length]);

  const summaryFor = useCallback(
    (value: DashPeriod) => buildDashboard(data.items, { project: project?.name ?? null, platform: 'all', accountKey: null, period: value, from: '', to: '' }, today, [], null),
    [data.items, project, today],
  );
  const periodSummary = useMemo(() => summaryFor(period), [summaryFor, period]);
  const results = useMemo(() => contentResults(periodSummary.items, projectLinks, projectEvents), [periodSummary.items, projectLinks, projectEvents]);
  const found = useMemo(() => findings(results, measured.has('lp_view'), measured.has('signup')), [results, measured]);
  const groups = useMemo(() => compareGroups(results, compareKey), [results, compareKey]);

  const weekly = useMemo(() => {
    const week = summaryFor('7');
    const previousItems = data.items.filter((item) => item.publishedDay && item.publishedDay >= week.ranges.previous.from && item.publishedDay <= week.ranges.previous.to && (!project || item.project.toLowerCase() === project.name.toLowerCase()));
    const range = dashRanges({ period: '7', from: '', to: '' }, today).current;
    return weeklySummary(contentResults(week.items, projectLinks, projectEvents), contentResults(previousItems, projectLinks, projectEvents), range, eventsInRange(projectEvents, range.from, range.to), {
      clicks: measured.has('click'),
      signups: measured.has('signup'),
    });
  }, [summaryFor, data.items, project, today, projectLinks, projectEvents, measured]);

  const briefing = useMemo(
    () => analysisBriefing(project?.name ?? 'todos os projetos', weekly, rankResults(results, 'engagement', 8), found, COMPARE_KEYS.map((key) => ({ title: COMPARE_LABELS[key], rows: compareGroups(results, key) }))),
    [project, weekly, results, found],
  );
  const projectInsights = insights.data.filter((insight) => (project ? insight.projectId === project.id : !insight.projectId));

  if (data.loading || scope.loading || links.loading || events.loading) return <Spinner label="Lendo os resultados" />;

  const thumb = (item: DashItem, className?: string) => <ContentThumb item={item} carousels={data.carousels.data} brands={data.brands.data} assets={data.assets.data} accounts={data.accounts.data} className={className} />;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const newVersions = (item: DashItem) =>
    run(`versions:${item.key}`, async () => {
      const { record, created } = await recordForContent(services, item, { records: library.records.data, carousels: data.carousels.data, accounts: data.accounts.data, publications: data.publications.data });
      if (created) library.records.setData((current) => [record, ...current]);
      actions.run('variations', record);
    });

  const askClaude = () =>
    run('analyze', async () => {
      const analysis = await services.ai.analyzeResults({ briefing });
      const saved = await services.insights.create({ projectId: project?.id ?? null, projectName: project?.name ?? 'Todos os projetos', from: weekly.range.from, to: weekly.range.to, analysis });
      insights.setData((current) => [saved, ...current]);
    });

  const copyBriefing = () =>
    run('copy', async () => {
      const ok = await copyText(`Leia estes resultados medidos das nossas contas e diga o que eles mostram, citando os números. Não invente dados, benchmarks ou previsões; sugira testes.\n\n${briefing}`);
      setMessage(ok ? 'Briefing copiado. Cole no Claude para a leitura escrita.' : 'O navegador bloqueou a cópia.');
    });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Inteligência"
        description={`${project ? `${project.name}: o` : 'O'} que os números reais mostram, com a evidência de cada achado e testes pra fazer a seguir.`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Gerar novas versões de
              <Select value={versionTarget} onChange={(e) => setVersionTarget(e.target.value)} className="!h-9 !w-64">
                <option value="">Escolha um conteúdo…</option>
                {results.map((result) => (
                  <option key={result.item.key} value={result.item.key}>
                    {result.item.title}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              variant="primary"
              disabled={!versionTarget}
              loading={busy === `versions:${versionTarget}`}
              onClick={() => {
                const item = results.find((result) => result.item.key === versionTarget)?.item;
                if (item) void newVersions(item);
              }}
            >
              <Wand2 className="size-4" aria-hidden /> Gerar novas versões
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {(error ?? actions.error) && <Alert>{error ?? actions.error}</Alert>}
        {message && <Alert tone="info">{message}</Alert>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={`Resumo da semana${project ? ` de ${project.name}` : ''}`} action={<span className="text-xs text-faint">{weekly.range.from.split('-').reverse().join('/')} a {weekly.range.to.split('-').reverse().join('/')}</span>}>
          <ul className="flex flex-col gap-1.5 text-sm text-ink">
            {weekly.lines.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-faint">Calculado direto dos números medidos, sem IA. Só aparece o que foi medido.</p>
        </Card>

        <Card
          title="Leitura escrita"
          action={
            services.ai.engine === 'claude' ? (
              <Button variant="secondary" size="sm" loading={busy === 'analyze'} onClick={() => void askClaude()}>
                <Sparkles className="size-3.5" aria-hidden /> Pedir leitura ao Claude
              </Button>
            ) : (
              <Button variant="secondary" size="sm" loading={busy === 'copy'} onClick={() => void copyBriefing()}>
                <ClipboardCopy className="size-3.5" aria-hidden /> Copiar briefing
              </Button>
            )
          }
        >
          {projectInsights.length === 0 ? (
            <p className="text-sm text-muted">
              {services.ai.engine === 'claude'
                ? 'O Claude recebe só os números desta tela (resumo, rankings, achados e comparações) e responde citando-os. Nada de fora entra.'
                : 'Com o motor local, a leitura escrita é feita colando o briefing no Claude. O briefing traz só os números medidos desta tela.'}
            </p>
          ) : (
            <InsightView insight={projectInsights[0]} />
          )}
          {projectInsights.length > 1 && <p className="mt-3 text-[11px] text-faint">{projectInsights.length - 1} leitura(s) anterior(es) guardada(s).</p>}
        </Card>
      </div>

      <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Período da análise</h2>
        <div role="radiogroup" aria-label="Período" className="flex gap-1 rounded-xl bg-subtle p-1">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={clsx('h-8 rounded-lg px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', period === value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
            >
              {value} dias
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {RANKS.map((rank) => {
          const list = rankResults(results, rank.key);
          return (
            <Card key={rank.key} title={rank.title}>
              {list.length === 0 ? (
                <p className="text-xs text-faint">{rank.empty}</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {list.map((result, index) => (
                    <li key={result.item.key}>
                      <button type="button" onClick={() => setSelected(result.item)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        <span className="w-4 text-xs tabular-nums text-faint">{index + 1}</span>
                        {thumb(result.item, 'size-9')}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{result.item.title}</span>
                          <span className="block text-[11px] text-faint">{DASH_PLATFORM_LABELS[result.item.platform]}</span>
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-ink">{rank.format(result)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="findings-title" className="mt-10">
        <h2 id="findings-title" className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
          Achados ({found.length})
        </h2>
        {found.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
            Nenhum padrão claro no período. Os achados aparecem quando um conteúdo tem muitas visualizações e pouca conversão, cliques que não viram visita, ou engaja muito com pouco alcance.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {found.map((finding) => (
              <li key={`${finding.kind}:${finding.result.item.key}`}>
                <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5">
                  <div className="flex items-start gap-3">
                    {thumb(finding.result.item, 'size-12')}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Lightbulb className="size-4 text-amber-600" aria-hidden /> {finding.title}
                      </p>
                      <button type="button" onClick={() => setSelected(finding.result.item)} className="truncate text-left text-xs text-muted underline-offset-4 hover:underline">
                        {finding.result.item.title}
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-xs leading-relaxed text-ink">{finding.evidence}</p>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                    {finding.suggestions.map((suggestion) => (
                      <li key={suggestion} className="flex gap-2">
                        <span aria-hidden>→</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <Button variant="secondary" size="sm" loading={busy === `versions:${finding.result.item.key}`} onClick={() => void newVersions(finding.result.item)}>
                      <Wand2 className="size-3.5" aria-hidden /> Gerar novas versões
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card
        title="O que funciona melhor"
        className="mt-10"
        action={
          <div role="tablist" aria-label="Comparar por" className="flex flex-wrap gap-1 rounded-xl bg-subtle p-1">
            {COMPARE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={compareKey === key}
                onClick={() => setCompareKey(key)}
                className={clsx('h-7 rounded-lg px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', compareKey === key ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
              >
                {COMPARE_LABELS[key]}
              </button>
            ))}
          </div>
        }
      >
        {groups.length === 0 ? (
          <p className="text-sm text-muted">Nenhum conteúdo do período tem {COMPARE_LABELS[compareKey].toLowerCase()} registrado.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th scope="col" className="py-2 pr-3 font-medium">{COMPARE_LABELS[compareKey]}</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Conteúdos</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Visualizações</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Engajamento</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">Cliques / mil views</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.label} className="border-b border-line/70 last:border-0">
                    <td className="py-2 pr-3 text-ink">
                      {group.label} {group.small && <Badge>amostra pequena</Badge>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{group.contents}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{group.views === null ? '—' : compactNumber(group.views)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{group.engagement === null ? '—' : percent(group.engagement)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-ink">{group.clicksPerThousand === null ? '—' : group.clicksPerThousand.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-faint">
              Comparação, não causa: um grupo à frente pode ter tido outros fatores (horário, tema, conta). Grupos com menos de 3 conteúdos são indícios. Cliques por mil views só contam conteúdos com link rastreável.
            </p>
          </div>
        )}
      </Card>

      {actions.dialogs}
      <ContentDetail
        item={selected}
        onClose={() => setSelected(null)}
        carousels={data.carousels.data}
        brands={data.brands.data}
        assets={data.assets.data}
        accounts={data.accounts.data}
        conversions={selected && <ContentConversions item={selected} links={links.data} events={events.data} shortLinkBase={tracking.shortLinkBase} />}
      />
    </div>
  );
}

function InsightView({ insight }: { insight: AiInsight }): ReactNode {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-ink">{insight.analysis.summary}</p>
      {insight.analysis.observations.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted">Observações</h3>
          <ul className="flex flex-col gap-2">
            {insight.analysis.observations.map((item) => (
              <li key={item.text}>
                <p className="text-ink">{item.text}</p>
                <p className="text-xs text-faint">Evidência: {item.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {insight.analysis.suggestions.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted">Testes sugeridos</h3>
          <ul className="flex flex-col gap-2">
            {insight.analysis.suggestions.map((item) => (
              <li key={item.text}>
                <p className="text-ink">{item.text}</p>
                <p className="text-xs text-faint">
                  Por quê: {item.basedOn} · Como medir: {item.test}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-faint">
        Leitura do Claude sobre {insight.from.split('-').reverse().join('/')} a {insight.to.split('-').reverse().join('/')}, feita em {new Date(insight.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
      </p>
    </div>
  );
}
