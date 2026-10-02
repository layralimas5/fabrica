import clsx from 'clsx';
import { ArrowLeft, Eye, Pencil, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccounts, useAssets, useBrandKits, useCarousels } from '../app/data';
import { renderContextFor } from '../app/renderContextFor';
import { useServices } from '../app/services';
import type { Carousel } from '../domain/carousel';
import { engagementRate, formatScore, goalScore, hasMetrics, RANKING_GOAL_LABELS, RANKING_GOALS, type Metrics, type RankingGoal } from '../domain/metrics';
import { experimentWinner, groupExperiments, variantLabel } from '../experiments/experiments';
import { MetricsForm } from '../experiments/MetricsForm';
import { CarouselViewer } from '../ui/CarouselViewer';
import { Alert, Badge, Button, EmptyState, Select, Spinner } from '../ui/primitives';
import { SlideCanvas } from '../ui/SlideCanvas';

const VARIANT_COLUMNS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'xl:grid-cols-4' };

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const services = useServices();
  const carousels = useCarousels();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();
  const [goal, setGoal] = useState<RankingGoal>('engagement');
  const [previewing, setPreviewing] = useState<Carousel | null>(null);

  const experiment = useMemo(() => groupExperiments(carousels.data).find((item) => item.id === id), [carousels.data, id]);

  if (carousels.loading || brands.loading || assets.loading) return <Spinner />;
  if (!experiment) return <EmptyState title="Teste não encontrado" description="Ele pode ter sido excluído." action={<Link to="/testes" className="text-sm text-accent underline">Ver testes</Link>} />;

  const winner = experimentWinner(experiment, goal);
  const secondary: RankingGoal = goal === 'engagement' ? 'saves' : goal;
  const contextOf = (carousel: Carousel) => {
    const brand = brands.data.find((kit) => kit.id === carousel.brandKitId);
    return brand ? renderContextFor(carousel, brand, assets.data, services.assets, accounts.data) : null;
  };

  const saveMetrics = async (carousel: Carousel, metrics: Metrics) => {
    const { id: carouselId, createdAt: _c, updatedAt: _u, ...input } = carousel;
    const updated = await services.carousels.update(carouselId, { ...input, metrics, status: 'published' });
    carousels.setData((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const previewContext = previewing ? contextOf(previewing) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link to="/testes" aria-label="Voltar para testes" className="mt-1 grid size-9 place-items-center rounded-xl text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-faint">Teste de formato</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{experiment.name}</h1>
            <p className="mt-1 text-sm text-muted">Mesmo texto e mesmas fotos em {experiment.variants.length} formatos. Poste em dias e horários parecidos pra comparar de forma justa.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="detail-goal" className="text-xs text-muted">
            Vencedor por
          </label>
          <Select id="detail-goal" value={goal} onChange={(e) => setGoal(e.target.value as RankingGoal)} className="!w-auto">
            {RANKING_GOALS.map((item) => (
              <option key={item} value={item}>
                {RANKING_GOAL_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {winner ? (
        <div className="mb-6">
          <Alert tone="success">
            Por {RANKING_GOAL_LABELS[goal].toLowerCase()}, a versão <strong>{variantLabel(winner)}</strong> está ganhando.
          </Alert>
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted">Lance as métricas de pelo menos duas versões pra ver a vencedora.</p>
      )}

      <ul className={clsx('grid gap-5 md:grid-cols-2', VARIANT_COLUMNS[experiment.variants.length])}>
        {experiment.variants.map((variant) => {
          const context = contextOf(variant);
          const isWinner = winner?.id === variant.id;
          return (
            <li key={variant.id} className={clsx('flex flex-col gap-4 rounded-2xl border bg-surface p-4', isWinner ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-line')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{variantLabel(variant)}</p>
                {isWinner && (
                  <Badge tone="success">
                    <Trophy className="mr-1 size-3" aria-hidden /> Vencedora
                  </Badge>
                )}
              </div>
              {context && <SlideCanvas context={context} slide={variant.slides[0]} index={0} scale={0.25} label={`Capa da versão ${variantLabel(variant)}`} className="!aspect-[4/5] rounded-xl" />}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setPreviewing(variant)}>
                  <Eye className="size-3.5" aria-hidden /> Ver prévia
                </Button>
                <Link
                  to={`/carrossel/${variant.id}`}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Pencil className="size-3.5" aria-hidden /> Editar
                </Link>
              </div>

              {hasMetrics(variant.metrics) && (
                <dl className="grid grid-cols-2 gap-2 rounded-xl bg-subtle p-3 text-xs">
                  <div>
                    <dt className="text-faint">Engajamento</dt>
                    <dd className="text-base font-semibold tabular-nums text-ink">{formatScore(engagementRate(variant.metrics), 'engagement')}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">{RANKING_GOAL_LABELS[secondary]}</dt>
                    <dd className="text-base font-semibold tabular-nums text-ink">{formatScore(goalScore(variant.metrics, secondary), secondary)}</dd>
                  </div>
                </dl>
              )}

              <MetricsForm idPrefix={`m-${variant.id}`} initial={variant.metrics} onSave={(metrics) => saveMetrics(variant, metrics)} />
            </li>
          );
        })}
      </ul>

      {previewing && previewContext && <CarouselViewer open onClose={() => setPreviewing(null)} context={previewContext} carousel={previewing} />}
    </div>
  );
}
