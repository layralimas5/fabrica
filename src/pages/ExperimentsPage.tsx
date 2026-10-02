import { FlaskConical, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCarousels } from '../app/data';
import { VISUAL_STYLE_LABELS, type VisualStyle } from '../domain/brandKit';
import { formatScore, hasMetrics, performanceBy, RANKING_GOAL_LABELS, RANKING_GOALS, type RankingGoal } from '../domain/metrics';
import { experimentWinner, groupExperiments, variantLabel } from '../experiments/experiments';
import { Alert, Badge, EmptyState, PageHeader, Select, Spinner } from '../ui/primitives';

export function ExperimentsPage() {
  const carousels = useCarousels();
  const [goal, setGoal] = useState<RankingGoal>('engagement');
  const created = (useLocation().state as { created?: number } | null)?.created;

  const experiments = useMemo(() => groupExperiments(carousels.data), [carousels.data]);
  const ranking = useMemo(
    () => performanceBy<VisualStyle>(carousels.data.map((carousel) => ({ key: carousel.source.visualStyle, metrics: carousel.metrics })), goal),
    [carousels.data, goal],
  );

  if (carousels.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Testes"
        description="Poste as versões de cada teste, lance os números e veja qual formato funciona melhor pro seu público."
        action={
          <div className="flex items-center gap-2">
            <label htmlFor="goal" className="text-xs text-muted">
              Comparar por
            </label>
            <Select id="goal" value={goal} onChange={(e) => setGoal(e.target.value as RankingGoal)} className="!w-auto">
              {RANKING_GOALS.map((item) => (
                <option key={item} value={item}>
                  {RANKING_GOAL_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {created && (
        <div className="mb-6">
          <Alert tone="success">{created} versões criadas. Abre cada teste, exporta as versões e posta.</Alert>
        </div>
      )}
      {carousels.error && <Alert>{carousels.error}</Alert>}

      <section aria-labelledby="ranking-title" className="mb-10 rounded-2xl border border-line bg-surface p-5">
        <h2 id="ranking-title" className="text-sm font-semibold text-ink">
          Ranking dos estilos
        </h2>
        <p className="mt-1 text-xs text-muted">Média de todos os carrosséis com métricas lançadas, por {RANKING_GOAL_LABELS[goal].toLowerCase()}.</p>
        {ranking.length === 0 ? (
          <p className="mt-4 text-sm text-faint">Ainda sem números. Lance as métricas de pelo menos um carrossel pra começar o ranking.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th scope="col" className="pb-2 font-medium">#</th>
                <th scope="col" className="pb-2 font-medium">Estilo</th>
                <th scope="col" className="pb-2 text-right font-medium">Média</th>
                <th scope="col" className="pb-2 text-right font-medium">Carrosséis medidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranking.map((row, position) => (
                <tr key={row.key}>
                  <td className="py-2.5 text-faint">{position + 1}</td>
                  <td className="py-2.5 font-medium text-ink">
                    {VISUAL_STYLE_LABELS[row.key]}
                    {position === 0 && ranking.length > 1 && <Trophy className="ml-1.5 inline size-3.5 text-amber-500" aria-label="Melhor" />}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink">{formatScore(row.averageScore, goal)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ranking.some((row) => row.samples < 3) && ranking.length > 0 && (
          <p className="mt-3 text-xs text-faint">Com menos de 3 carrosséis medidos por estilo, trate o resultado como pista, não como regra.</p>
        )}
      </section>

      <h2 className="mb-4 text-sm font-semibold text-ink">Seus testes</h2>
      {experiments.length === 0 ? (
        <EmptyState
          title="Nenhum teste ainda"
          description='Na tela Criar, ligue "Testar formatos" e marque de 2 a 4 estilos. Cada um vira uma versão com o mesmo texto.'
          action={
            <Link to="/criar" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
              <FlaskConical className="size-4" aria-hidden /> Criar um teste
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {experiments.map((experiment) => {
            const winner = experimentWinner(experiment, goal);
            const measured = experiment.variants.filter((variant) => hasMetrics(variant.metrics)).length;
            return (
              <li key={experiment.id}>
                <Link
                  to={`/testes/${experiment.id}`}
                  className="block rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <p className="line-clamp-2 text-sm font-semibold text-ink">{experiment.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(experiment.createdAt).toLocaleDateString('pt-BR')} · {measured} de {experiment.variants.length} versões medidas
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {experiment.variants.map((variant) => (
                      <Badge key={variant.id} tone={winner?.id === variant.id ? 'success' : 'neutral'}>
                        {winner?.id === variant.id && '🏆 '}
                        {variantLabel(variant)}
                      </Badge>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
