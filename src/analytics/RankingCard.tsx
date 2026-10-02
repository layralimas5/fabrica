import { formatAnalysisValue, MIN_GROUP_SAMPLES, type AnalysisMetric, type GroupStat } from '../domain/winners/insights';

/** Ranked bars: average per group, with the sample size and a warning when it is thin. */
export function RankingCard({ title, stats, metric, limit = 6 }: { title: string; stats: GroupStat[]; metric: AnalysisMetric; limit?: number }) {
  const top = stats[0]?.average ?? 0;
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {stats.length === 0 ? (
        <p className="mt-3 text-sm text-faint">Sem dados com essa métrica.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {stats.slice(0, limit).map((stat, index) => {
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
