import { AlertTriangle, Gauge, Pin, Recycle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { AccountComparison, ChampionCard, ContentThumb, KpiGrid, RankingTable, SectionTitle, TemplateCard, WinnerTile } from '../analytics/sections';
import { GrowthSection } from '../analytics/GrowthSection';
import { RankingCard } from '../analytics/RankingCard';
import { accountLabel as labelOfAccount } from '../domain/account';
import { isMeasured, type AnalyticsItem } from '../domain/analytics/items';
import {
  accountStats,
  ANALYTICS_PERIOD_LABELS,
  ANALYTICS_PERIODS,
  applyAnalyticsFilters,
  CONTENT_KIND_LABELS,
  CONTENT_KINDS,
  isPublished,
  overdueUnposted,
  kpis,
  pooledRate,
  recycleCandidates,
  themeFrequency,
  scoredItems,
  templateStats,
  weeklyChampion,
  type AnalyticsFilters,
  type Scored,
} from '../domain/analytics/summary';
import { postedStatus, toCarouselInput } from '../domain/carousel';
import { PublishedReconcile } from '../analytics/PublishedReconcile';
import { todayIso } from '../domain/schedule';
import { exactSlides, generateInsights, GROUP_KEYS, groupStats, type GroupKeyOf } from '../domain/winners/insights';
import { accountKey, CONTENT_PLATFORM_LABELS, emptyRecordInput, toRecordInput, type ContentRecord, type ContentRecordInput, type PerformanceKey } from '../domain/winners/record';
import { SCORE_PROFILE_LABELS } from '../domain/winners/score';
import { Alert, Button, EmptyState, Field, Input, PageHeader, Spinner } from '../ui/primitives';
import { Chip } from '../winners/chips';
import { InsightsPanel, ScoreSettingsDialog } from '../winners/InsightsPanel';
import { useAddMetrics } from '../winners/useAddMetrics';
import { WinnerFormDialog } from '../winners/WinnerFormDialog';
import { useWinnerActions } from '../winners/useWinnerActions';
import { accountLabelOf, useWinnerLibrary } from '../winners/useWinnerLibrary';
import { useExperimentLab } from '../experiments/useExperimentLab';
import { useSimilaritySettings } from '../app/planningSettings';
import { ExperimentCard, Learnings, TestMap } from '../experiments/ExperimentViews';

const KPI_KEYS: PerformanceKey[] = ['views', 'likes', 'shares', 'saves', 'comments', 'follows', 'clicks', 'signups', 'sales'];
const TOP_WINNERS = 6;
/** Below this, a template is a hint, not a winner. */
const MIN_TEMPLATE_USES = 3;
const PLATFORM_FILTERS = ['all', 'tiktok', 'instagram'] as const;

export function AnalyticsPage() {
  const services = useServices();
  const navigate = useNavigate();
  const library = useWinnerLibrary();
  const actions = useWinnerActions(library);
  const scope = useAccountScope();
  const metrics = useAddMetrics((saved, carousel) => {
    library.records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    // After the first numbers, a posted carousel moves to "Em análise", like in the editor.
    if (carousel?.status !== 'published') return;
    services.carousels
      .update(carousel.id, toCarouselInput({ ...carousel, status: 'analyzing' }))
      .then((updated) => library.carousels.setData((current) => current.map((item) => (item.id === updated.id ? updated : item))))
      .catch((cause: unknown) => setError(errorMessage(cause)));
  });
  const [filters, setFilters] = useState<Omit<AnalyticsFilters, 'accountId'>>({ platform: 'all', period: '30', from: '', to: '', kind: 'all' });
  const [scoreOpen, setScoreOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const lab = useExperimentLab();
  const { settings: similarity } = useSimilaritySettings();
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const { items, brands, assets, accounts, score } = library;

  const full: AnalyticsFilters = { ...filters, accountId: scope.current?.id ?? null };
  const filtered = useMemo(() => applyAnalyticsFilters(items, full, today), [items, full.accountId, full.platform, full.period, full.from, full.to, full.kind, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const published = useMemo(() => filtered.filter(isPublished), [filtered]);
  const allPeriods = useMemo(() => applyAnalyticsFilters(items, { ...full, period: 'all' }, today), [items, full.accountId, full.platform, full.kind, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const overdue = useMemo(() => overdueUnposted(allPeriods, today), [allPeriods, today]);
  const publishedAnyDay = useMemo(() => allPeriods.filter(isPublished), [allPeriods]);
  const outsidePeriod = filters.period === 'all' ? 0 : publishedAnyDay.length - published.length;

  /** Every overdue carousel becomes Publicado on its scheduled day, so it counts in the right period. */
  const markOverduePosted = async () => {
    setError(null);
    try {
      for (const { carousel } of overdue) {
        if (!carousel) continue;
        const saved = await services.carousels.update(carousel.id, toCarouselInput({ ...carousel, status: postedStatus(true) }));
        library.carousels.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const measured = useMemo(() => filtered.filter(isMeasured), [filtered]);
  const records = useMemo(() => measured.map((item) => item.record), [measured]);
  const scored = useMemo(() => scoredItems(filtered, library.scoreValue), [filtered, library.scoreValue]);
  const champion = useMemo(() => weeklyChampion(applyAnalyticsFilters(items, { ...full, period: 'all' }, today), library.scoreValue, today), [items, full.accountId, full.platform, full.kind, library.scoreValue, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const insights = useMemo(() => generateInsights(records, library.accountLabel, library.scoreValue), [records, library.accountLabel, library.scoreValue]);
  const templates = useMemo(() => templateStats(filtered, library.scoreValue), [filtered, library.scoreValue]);
  // Accounts are compared across the same filter, but always all of them.
  const comparison = useMemo(() => accountStats(applyAnalyticsFilters(items, full, today, true), library.scoreValue), [items, full.platform, full.period, full.from, full.to, full.kind, library.scoreValue, today]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A post already live, of the account in view, published today unless changed. */
  const postedDraft = useMemo<ContentRecordInput>(
    () => ({ ...emptyRecordInput(), winner: false, accountId: scope.current?.id ?? null, platform: scope.current?.platform ?? 'instagram', publishedAt: today }),
    [scope.current, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const patterns: { title: string; keyOf: GroupKeyOf }[] = [
    { title: 'Ganchos vencedores', keyOf: GROUP_KEYS.hookType },
    { title: 'Temas vencedores', keyOf: GROUP_KEYS.theme },
    { title: 'Tipos de carrossel', keyOf: GROUP_KEYS.contentType },
    { title: 'Quantidade de slides', keyOf: exactSlides },
    { title: 'Horários de postagem', keyOf: GROUP_KEYS.postingTime },
    { title: 'Tags', keyOf: GROUP_KEYS.tag },
    { title: 'Objetivos', keyOf: GROUP_KEYS.objective },
  ];

  if (library.loading || scope.loading) return <Spinner label="Calculando o Analytics" />;

  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));
  const accountOf = (item: AnalyticsItem) => accountLabelOf(item.record, accounts.data) ?? CONTENT_PLATFORM_LABELS[item.record.platform];
  const scoreDetail = (item: AnalyticsItem) => library.scoreOf(item.record.metrics, accountKey(item.record));
  const thumb = (item: AnalyticsItem) => <ContentThumb item={item} brands={brands.data} assets={assets.data} accounts={accounts.data} />;

  /** Carousels without results have no record yet; variations need one to link the family. */
  const ensureRecord = async (item: AnalyticsItem): Promise<ContentRecord> => {
    if (!item.derived) return item.record;
    const saved = await services.contentRecords.create(toRecordInput(item.record));
    library.records.setData((current) => [saved, ...current]);
    return saved;
  };

  const view = (item: AnalyticsItem) => (item.carousel ? actions.run('view', item.record) : navigate(`/vencedores/${item.record.id}`));
  const vary = async (item: AnalyticsItem) => {
    setError(null);
    try {
      actions.run('variations', await ensureRecord(item));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const open = (item: AnalyticsItem) => navigate(item.carousel ? `/carrossel/${item.carousel.id}` : `/vencedores/${item.record.id}`);
  const editMetrics = (item: AnalyticsItem) => (item.carousel ? metrics.open(item.carousel) : metrics.openRecord(item.record));
  const showcase = (entry: Scored) => ({ entry, thumb: thumb(entry.item), accountLabel: accountOf(entry.item), scoreDetail: scoreDetail(entry.item), onView: () => view(entry.item), onVary: () => void vary(entry.item) });

  const kpiValues = kpis(measured, KPI_KEYS);
  const themes = themeFrequency(published);
  const recyclable = recycleCandidates(applyAnalyticsFilters(items, { ...full, period: 'all' }, today), library.scoreValue, today, similarity.lowDays).slice(0, 3);
  const scopedExperiments = lab.experiments.filter((experiment) => !scope.current || !experiment.accountId || experiment.accountId === scope.current.id);
  const experimentAccount = (accountId: string | null) => {
    const account = scope.accounts.find((item) => item.id === accountId);
    return account ? labelOfAccount(account) : 'Várias contas';
  };
  const rates: Partial<Record<PerformanceKey, number | null>> = { shares: pooledRate(measured, 'shares'), saves: pooledRate(measured, 'saves'), follows: pooledRate(measured, 'follows'), likes: pooledRate(measured, 'likes'), comments: pooledRate(measured, 'comments') };
  const winnerTemplate = templates.find((stat) => stat.uses >= MIN_TEMPLATE_USES && stat.averageScore !== null)?.template ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Analytics"
        description="O que performou, por que performou e o que criar agora."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setScoreOpen(true)}>
              <Gauge className="size-4" aria-hidden /> Score: {SCORE_PROFILE_LABELS[score.profile]}
            </Button>
            <Button variant="primary" onClick={() => setRegistering(true)}>
              <Pin className="size-4" aria-hidden /> Registrar post publicado
            </Button>
          </div>
        }
      />

      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Field label="Conta" htmlFor="analytics-account">
            <select
              id="analytics-account"
              value={scope.current?.id ?? ''}
              onChange={(e) => scope.setCurrent(e.target.value || null)}
              className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
            >
              <option value="">Todas</option>
              {scope.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {labelOfAccount(account)} · {CONTENT_PLATFORM_LABELS[account.platform]}
                  {account.status === 'paused' ? ' (pausada)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-3">
            <FilterRow label="Plataforma">
              {PLATFORM_FILTERS.map((platform) => (
                <Chip key={platform} active={filters.platform === platform} onClick={() => set({ platform })}>
                  {platform === 'all' ? 'Todas' : CONTENT_PLATFORM_LABELS[platform]}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Período">
              {ANALYTICS_PERIODS.map((period) => (
                <Chip key={period} active={filters.period === period} onClick={() => set({ period })}>
                  {ANALYTICS_PERIOD_LABELS[period]}
                </Chip>
              ))}
            </FilterRow>
            {filters.period === 'custom' && (
              <div className="grid max-w-sm grid-cols-2 gap-2">
                <Field label="De" htmlFor="analytics-from">
                  <Input id="analytics-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
                </Field>
                <Field label="Até" htmlFor="analytics-to">
                  <Input id="analytics-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
                </Field>
              </div>
            )}
            <FilterRow label="Tipo">
              {CONTENT_KINDS.map((kind) => (
                <Chip key={kind} active={filters.kind === kind} onClick={() => set({ kind })}>
                  {CONTENT_KIND_LABELS[kind]}
                </Chip>
              ))}
            </FilterRow>
          </div>
        </div>
      </div>

      {(error ?? actions.error ?? library.error) && (
        <div className="mb-6">
          <Alert>{error ?? actions.error ?? library.error}</Alert>
        </div>
      )}

      <PublishedReconcile overdue={overdue.length} outsidePeriod={outsidePeriod} onMarkPosted={markOverduePosted} onShowAll={() => set({ period: 'all' })} />

      {published.length === 0 && measured.length === 0 ? (
        <EmptyState
          title="Nada publicado nesse filtro"
          description="Marque os carrosséis como postados e use “Adicionar métricas” no editor. Post que já está no ar e não foi feito aqui (ou se perdeu) entra por “Registrar post publicado”."
          action={
            <Button variant="primary" onClick={() => setRegistering(true)}>
              <Pin className="size-4" aria-hidden /> Registrar post publicado
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-label="Números do período">
            <KpiGrid
              published={published.length}
              periodLabel={filters.period === 'all' ? 'desde o início' : filters.period === 'custom' ? 'no período escolhido' : `nos últimos ${ANALYTICS_PERIOD_LABELS[filters.period]}`}
              kpis={kpiValues}
              rates={rates}
            />
            {measured.length < published.length && (
              <p className="mt-2 text-xs text-faint">
                {published.length - measured.length} {published.length - measured.length === 1 ? 'conteúdo publicado ainda não tem' : 'conteúdos publicados ainda não têm'} métricas. Use “Métricas” no ranking abaixo.
              </p>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {champion ? (
              <ChampionCard {...showcase(champion)} />
            ) : (
              <section className="rounded-2xl border border-dashed border-line p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">🏆 Campeão da semana</p>
                <p className="mt-2 text-sm text-muted">Nenhum conteúdo dos últimos 7 dias tem métricas ainda.</p>
              </section>
            )}
            <InsightsPanel insights={insights} measured={measured.length} limit={5} />
          </div>

          <GrowthSection items={publishedAnyDay} today={today} accountLabel={accountOf} onMeasure={editMetrics} />

          <section aria-labelledby="winners-title">
            <SectionTitle hint="Os melhores Performance Scores do filtro, comparando cada conteúdo com a média da própria conta.">
              <span id="winners-title">🏆 Carrosséis vencedores</span>
            </SectionTitle>
            {scored.length === 0 ? (
              <p className="text-sm text-faint">Pra ter score, um conteúdo precisa das visualizações e de mais uma métrica (salvos, compartilhamentos, seguidores…).</p>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {scored.slice(0, TOP_WINNERS).map((entry) => (
                  <WinnerTile key={entry.item.record.id} {...showcase(entry)} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="patterns-title">
            <SectionTitle hint="Performance Score médio de cada grupo. Grupos com menos de 3 conteúdos aparecem como pista, não como regra.">
              <span id="patterns-title">Padrões que estão funcionando</span>
            </SectionTitle>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {patterns.map((pattern) => (
                <RankingCard key={pattern.title} title={pattern.title} stats={groupStats(records, pattern.keyOf, 'score', library.scoreValue)} metric="score" limit={5} />
              ))}
            </div>
          </section>

          {templates.length > 0 && (
            <section aria-labelledby="templates-title">
              <SectionTitle hint={`Modelo dos slides. O selo aparece pro melhor score médio com pelo menos ${MIN_TEMPLATE_USES} usos.`}>
                <span id="templates-title">Templates</span>
              </SectionTitle>
              <ul className="grid gap-3 md:grid-cols-2">
                {templates.map((stat) => (
                  <TemplateCard key={stat.template} stat={stat} winner={stat.template === winnerTemplate} thumb={stat.best ? thumb(stat.best) : <div className="aspect-[4/5] bg-subtle" />} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="experiments-title">
            <SectionTitle hint="Cada teste com hipótese, variável e resultado. Conclusões de amostra pequena aparecem com confiança baixa." action={<Link to="/testes" className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">Ver todos os testes</Link>}>
              <span id="experiments-title">Experimentos</span>
            </SectionTitle>
            <TestMap experiments={scopedExperiments} />
            {scopedExperiments.length > 0 && (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {scopedExperiments.slice(0, 4).map((experiment) => (
                  <li key={experiment.id}>
                    <ExperimentCard experiment={experiment} result={lab.resultOf(experiment)} accountName={experimentAccount(experiment.accountId)} />
                  </li>
                ))}
              </ul>
            )}
            <Learnings experiments={scopedExperiments} accountName={experimentAccount} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="themes-title" className="rounded-2xl border border-line bg-surface p-5">
              <SectionTitle hint="Quantos conteúdos publicados de cada tema no período.">
                <span id="themes-title">Frequência de temas</span>
              </SectionTitle>
              {themes.length === 0 ? (
                <p className="text-sm text-faint">Nenhum conteúdo com tema no período. O tema fica no editor e no Calendário.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {themes.slice(0, 8).map((theme) => (
                    <li key={theme.theme} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-1.5 text-ink">
                        {theme.overused && <AlertTriangle className="size-3.5 text-amber-600" aria-label="Tema usado em excesso" />}
                        {theme.theme}
                      </span>
                      <span className="tabular-nums text-muted">
                        {theme.count} {theme.count === 1 ? 'conteúdo' : 'conteúdos'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {themes.some((theme) => theme.overused) && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  {themes.filter((theme) => theme.overused).map((theme) => theme.theme).join(', ')} {themes.filter((theme) => theme.overused).length === 1 ? 'ocupa' : 'ocupam'} boa parte do período. Vale alternar pra não soar repetitivo.
                </p>
              )}
            </section>

            <section aria-labelledby="recycle-title" className="rounded-2xl border border-line bg-surface p-5">
              <SectionTitle hint={`Conteúdos com score ${60}+ publicados há ${similarity.lowDays} dias ou mais.`}>
                <span id="recycle-title">♻️ Bons candidatos para reciclagem</span>
              </SectionTitle>
              {recyclable.length === 0 ? (
                <p className="text-sm text-faint">Nenhum conteúdo antigo e bom o bastante ainda.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {recyclable.map((entry) => (
                    <li key={entry.item.record.id} className="flex items-center gap-3 rounded-xl bg-subtle px-3 py-2.5">
                      <Recycle className="size-4 shrink-0 text-emerald-600" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-ink">“{entry.item.record.hook || entry.item.record.title}”</p>
                        <p className="text-xs text-faint">
                          Score {entry.score} · há {entry.ageDays} dias
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => void vary(entry.item)}>
                        Criar nova versão
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {comparison.length > 1 && (
            <section aria-labelledby="accounts-title" className="rounded-2xl border border-line bg-surface p-5">
              <SectionTitle hint="Taxas por visualização, que dá pra comparar entre públicos de tamanhos diferentes. ▲ marca a melhor de cada coluna.">
                <span id="accounts-title">Comparação entre contas</span>
              </SectionTitle>
              <AccountComparison stats={comparison} label={library.accountLabel} />
            </section>
          )}

          <section aria-labelledby="ranking-title">
            <SectionTitle hint="Clique no título pra abrir, nas colunas pra ordenar.">
              <span id="ranking-title">Ranking de conteúdos</span>
            </SectionTitle>
            <RankingTable items={published} scoreOf={(item) => library.scoreValue(item.record.metrics, accountKey(item.record))} accountLabel={accountOf} onOpen={open} onMetrics={editMetrics} />
          </section>
        </div>
      )}

      {actions.dialogs}
      {metrics.dialog}
      <WinnerFormDialog
        open={registering}
        mode="posted"
        onClose={() => setRegistering(false)}
        initial={postedDraft}
        recordId={null}
        accounts={accounts.data}
        library={library.records.data}
        onSaved={(saved) => {
          library.records.setData((current) => [saved, ...current]);
          setRegistering(false);
          metrics.openRecord(saved);
        }}
      />
      {scoreOpen && <ScoreSettingsDialog open onClose={() => setScoreOpen(false)} profile={score.profile} weights={score.weights} onProfile={score.setProfile} onCustom={score.setCustom} />}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}
