import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { todayIso } from '../domain/schedule';
import { familyMembers, structureStats } from '../domain/winners/family';
import { applyFilters, EMPTY_FILTERS, type WinnerFilters } from '../domain/winners/filters';
import { analysisMetricLabel, formatAnalysisValue, generateInsights, GROUP_KEYS, groupStats, MIN_GROUP_SAMPLES, type AnalysisMetric, type GroupKeyOf, type GroupStat } from '../domain/winners/insights';
import { accountKey, hasAnyMetric, type ContentRecord } from '../domain/winners/record';
import { Alert, EmptyState, PageHeader, Spinner } from '../ui/primitives';
import { Chip } from '../winners/chips';
import { FiltersPanel } from '../winners/FiltersPanel';
import { InsightsPanel } from '../winners/InsightsPanel';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';
import { WinnersTabs } from '../winners/WinnersTabs';
import { MetricSelect } from '../winners/MetricSelect';

export function WinnersAnalysisPage() {
  const library = useWinnerLibrary();
  const [filters, setFilters] = useState<WinnerFilters>(EMPTY_FILTERS);
  const [metric, setMetric] = useState<AnalysisMetric>('views');
  const [onlyWinners, setOnlyWinners] = useState(false);
  const { records, carousels } = library;

  const measured = useMemo(() => records.data.filter((record) => hasAnyMetric(record.metrics) && (!onlyWinners || record.winner)), [records.data, onlyWinners]);
  const scoped = useMemo(() => applyFilters(measured, filters, todayIso()), [measured, filters]);
  const themeOptions = useMemo(() => [...new Set(measured.map((record) => record.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [measured]);
  const insights = useMemo(() => generateInsights(scoped, library.accountLabel), [scoped, library.accountLabel]);

  const accountGroup: GroupKeyOf = (record: ContentRecord) => {
    const key = accountKey(record);
    return key ? { key, label: library.accountLabel(key) } : null;
  };
  const sections: { title: string; keyOf: GroupKeyOf }[] = [
    { title: 'Melhores formatos', keyOf: GROUP_KEYS.format },
    { title: 'Melhores temas', keyOf: GROUP_KEYS.theme },
    { title: 'Melhores ganchos', keyOf: GROUP_KEYS.hookType },
    { title: 'Melhores contas', keyOf: accountGroup },
    { title: 'Melhores pilares', keyOf: GROUP_KEYS.pillar },
    { title: 'Tamanho do carrossel', keyOf: GROUP_KEYS.slides },
  ];

  const models = useMemo(() => records.data.filter((record) => record.winner && familyMembers(record.id, carousels.data, records.data).length > 0), [records.data, carousels.data]);
  const structures = useMemo(() => structureStats(models, carousels.data, records.data, metric, library.scoreValue), [models, carousels.data, records.data, metric, library.scoreValue]);

  if (library.loading) return <Spinner label="Calculando a análise" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Modelos Vencedores" description="O que está funcionando, medido nos seus próprios números." />
      <WinnersTabs />
      {library.error && (
        <div className="mb-4">
          <Alert>{library.error}</Alert>
        </div>
      )}

      {measured.length === 0 && !onlyWinners ? (
        <EmptyState
          title="Ainda sem números pra comparar"
          description="Marque conteúdos como vencedores ou lance os resultados das variações. A análise compara formatos, temas, ganchos e contas assim que houver dados."
          action={<Link to="/vencedores" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Ir para a biblioteca</Link>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MetricSelect id="analysis-metric" value={metric} onChange={setMetric} />
            <div className="flex gap-1.5" role="group" aria-label="Quais conteúdos entram">
              <Chip active={!onlyWinners} onClick={() => setOnlyWinners(false)}>
                Tudo que tem resultado
              </Chip>
              <Chip active={onlyWinners} onClick={() => setOnlyWinners(true)}>
                Só vencedores
              </Chip>
            </div>
          </div>
          <FiltersPanel filters={filters} onChange={setFilters} accountOptions={library.accountOptions} themeOptions={themeOptions} showHighlights={false} />
          <p className="text-xs text-muted">
            {scoped.length} {scoped.length === 1 ? 'conteúdo' : 'conteúdos'} na análise · média de {analysisMetricLabel(metric).toLowerCase()} por grupo, só com quem mediu essa métrica.
          </p>

          <InsightsPanel insights={insights} measured={scoped.length} />

          <div className="grid gap-5 md:grid-cols-2">
            {sections.map((section) => (
              <RankingCard key={section.title} title={section.title} stats={groupStats(scoped, section.keyOf, metric, library.scoreValue)} metric={metric} />
            ))}
          </div>

          <section aria-labelledby="structures-title" className="rounded-2xl border border-line bg-surface p-5">
            <h2 id="structures-title" className="text-sm font-semibold text-ink">
              Melhores estruturas
            </h2>
            <p className="mt-1 text-xs text-muted">Vencedores que viraram modelo e como o mecanismo deles performa nos conteúdos criados a partir deles.</p>
            {structures.length === 0 ? (
              <p className="mt-4 text-sm text-faint">Nenhum vencedor virou modelo ainda. Use “Criar variações” ou “Criar família” e lance os resultados depois de publicar.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-faint">
                      <th scope="col" className="pb-2 font-medium">Modelo</th>
                      <th scope="col" className="pb-2 text-right font-medium">Original</th>
                      <th scope="col" className="pb-2 text-right font-medium">Média das derivadas</th>
                      <th scope="col" className="pb-2 text-right font-medium">Medidas</th>
                      <th scope="col" className="pb-2 pl-4 font-medium">Melhor derivada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {structures.map((stat) => (
                      <tr key={stat.model.id}>
                        <td className="max-w-[220px] py-2.5 pr-3">
                          <Link to={`/vencedores/${stat.model.id}?aba=familia`} className="line-clamp-1 font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            {stat.model.mainModel && '🏆 '}
                            {stat.model.hook || stat.model.title}
                          </Link>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted">{stat.modelValue === null ? '—' : formatAnalysisValue(metric, stat.modelValue)}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-ink">{stat.average === null ? '—' : formatAnalysisValue(metric, stat.average)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted">
                          {stat.measured}/{stat.members}
                        </td>
                        <td className="max-w-[200px] py-2.5 pl-4">
                          <span className="line-clamp-1 text-muted">{stat.best?.carousel.title ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, stats, metric }: { title: string; stats: GroupStat[]; metric: AnalysisMetric }) {
  const top = stats[0]?.average ?? 0;
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {stats.length === 0 ? (
        <p className="mt-3 text-sm text-faint">Sem dados com essa métrica.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {stats.map((stat, index) => {
            const thin = stat.samples < MIN_GROUP_SAMPLES;
            return (
              <li key={stat.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    {index === 0 && stats.length > 1 && !thin && <span aria-label="Melhor">🏆 </span>}
                    {stat.label}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-ink">{formatAnalysisValue(metric, stat.average)}</span>
                    <span className="ml-1.5 text-xs text-faint" title={thin ? 'Menos de 3 conteúdos: trate como pista, não como regra' : undefined}>
                      {stat.samples} {stat.samples === 1 ? 'conteúdo' : 'conteúdos'}
                      {thin && ' · pouca amostra'}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <div className={thin ? 'h-full rounded-full bg-faint/50' : 'h-full rounded-full bg-ink'} style={{ width: `${top > 0 ? Math.max(4, (stat.average / top) * 100) : 0}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
