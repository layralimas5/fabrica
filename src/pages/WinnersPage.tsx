import { Gauge, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { todayIso } from '../domain/schedule';
import { applyFilters, EMPTY_FILTERS, SORT_OPTIONS, sortRecords, type SortOption, type WinnerFilters } from '../domain/winners/filters';
import { generateInsights } from '../domain/winners/insights';
import { hasAnyMetric, PERFORMANCE_KEYS, type PerformanceKey } from '../domain/winners/record';
import { SCORE_PROFILE_LABELS } from '../domain/winners/score';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../ui/primitives';
import { FiltersPanel } from '../winners/FiltersPanel';
import { InsightsPanel, ScoreSettingsDialog } from '../winners/InsightsPanel';
import { useWinnerActions } from '../winners/useWinnerActions';
import { accountLabelOf, useWinnerLibrary } from '../winners/useWinnerLibrary';
import { WinnerCard } from '../winners/WinnerCard';
import { WinnersTabs } from '../winners/WinnersTabs';

const SORT_STORAGE_KEY = 'fabrica:winners-sort';

function readSort(): SortOption {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.find((option) => option === stored) ?? 'recentes';
  } catch {
    return 'recentes';
  }
}

export function WinnersPage() {
  const library = useWinnerLibrary();
  const actions = useWinnerActions(library);
  const [filters, setFilters] = useState<WinnerFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortOption>(readSort);
  const [scoreOpen, setScoreOpen] = useState(false);
  const { records, carousels, brands, assets, accounts, score } = library;

  const winners = useMemo(() => records.data.filter((record) => record.winner), [records.data]);
  const themeOptions = useMemo(() => [...new Set(winners.map((record) => record.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [winners]);
  const visible = useMemo(() => sortRecords(applyFilters(winners, filters, todayIso()), sort, library.scoreValue), [winners, filters, sort, library.scoreValue]);
  const measured = useMemo(() => records.data.filter((record) => hasAnyMetric(record.metrics)), [records.data]);
  const insights = useMemo(() => generateInsights(measured, library.accountLabel), [measured, library.accountLabel]);
  const focus = (PERFORMANCE_KEYS as readonly string[]).includes(sort) ? (sort as PerformanceKey) : null;

  const changeSort = (next: SortOption) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      // Remembering the sort is a convenience.
    }
  };

  if (library.loading) return <Spinner label="Carregando os vencedores" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Modelos Vencedores"
        description="Não copie o conteúdo vencedor. Copie o mecanismo que fez ele funcionar."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setScoreOpen(true)} title="Pesos do Content Score">
              <Gauge className="size-4" aria-hidden /> Score: {SCORE_PROFILE_LABELS[score.profile]}
            </Button>
            <Button variant="secondary" onClick={actions.addExternal}>
              <Plus className="size-4" aria-hidden /> Conteúdo de fora
            </Button>
          </div>
        }
      />
      <WinnersTabs />

      {(library.error ?? actions.error) && (
        <div className="mb-4">
          <Alert>{library.error ?? actions.error}</Alert>
        </div>
      )}

      {winners.length === 0 ? (
        <EmptyState
          title="Nenhum vencedor ainda"
          description="Abra um carrossel que já foi publicado e toque em ⭐ Marcar como vencedor. Conteúdo feito fora da Fábrica (UGC, POV, vídeo) entra por “Conteúdo de fora”."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/projetos" className="inline-flex h-10 items-center rounded-xl bg-ink px-3.5 text-sm font-medium text-canvas hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
                Ir para Projetos
              </Link>
              <Button variant="secondary" onClick={actions.addExternal}>
                Conteúdo de fora
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <InsightsPanel insights={insights} measured={measured.length} limit={3} showLink />
          <FiltersPanel filters={filters} onChange={setFilters} accountOptions={library.accountOptions} themeOptions={themeOptions} sort={sort} onSort={changeSort} />
          <p className="text-xs text-muted" aria-live="polite">
            {visible.length === winners.length ? `${winners.length} ${winners.length === 1 ? 'vencedor' : 'vencedores'}` : `${visible.length} de ${winners.length} vencedores`}
          </p>
          {visible.length === 0 ? (
            <EmptyState title="Nada com esses filtros" description="Tira algum filtro ou muda a busca." />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((record) => {
                const carousel = record.carouselId ? (carousels.data.find((item) => item.id === record.carouselId) ?? null) : null;
                return (
                  <WinnerCard
                    key={record.id}
                    record={record}
                    carousel={carousel}
                    brand={brands.data.find((kit) => kit.id === carousel?.brandKitId) ?? null}
                    assets={assets.data}
                    accounts={accounts.data}
                    accountLabel={accountLabelOf(record, accounts.data)}
                    score={library.scoreOf(record.metrics)}
                    focus={focus}
                    onAction={(action) => actions.run(action, record)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}

      {actions.dialogs}
      {scoreOpen && (
        <ScoreSettingsDialog open onClose={() => setScoreOpen(false)} profile={score.profile} weights={score.weights} onProfile={score.setProfile} onCustom={score.setCustom} />
      )}
    </div>
  );
}
