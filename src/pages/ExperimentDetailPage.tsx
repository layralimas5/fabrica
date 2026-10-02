import clsx from 'clsx';
import { ArrowLeft, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { errorMessage } from '../app/useResource';
import { accountLabel } from '../domain/account';
import { statusLabel, type Carousel } from '../domain/carousel';
import { testsTime, VARIABLE_QUESTIONS, versionDimensions, versionPart } from '../domain/experiments/brief';
import { CONFIDENCE_LABELS, EXPERIMENT_LIMITS, EXPERIMENT_STATUS_LABELS, TEST_METRIC_LABELS, TEST_VARIABLE_LABELS, toExperimentInput, variablesOf, variantOf, type Experiment } from '../domain/experiments/experiment';
import { formatPercent } from '../domain/winners/record';
import { ExperimentForm } from '../experiments/ExperimentForm';
import { useExperimentLab } from '../experiments/useExperimentLab';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, Spinner, Textarea } from '../ui/primitives';
import { useAddMetrics } from '../winners/useAddMetrics';
import { EXPERIMENT_STATUS_TONES, postingLabel } from '../experiments/ExperimentViews';
import { ApplyWinner } from '../experiments/ApplyWinner';
import { useServices } from '../app/services';
import { normalizeAccountDefaults } from '../domain/account';
import { awaitsMeasurement, MEASURE_AFTER_DAYS, pendingMeasurements, sampleProgress } from '../domain/experiments/followUp';
import type { DimensionLeader, WinnerPlan } from '../domain/experiments/winner';
import { addDays, todayIso } from '../domain/schedule';

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lab = useExperimentLab();
  const scope = useAccountScope();
  const navigate = useNavigate();
  const services = useServices();
  const metrics = useAddMetrics((saved) => lab.library.records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [learning, setLearning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Part of the version the result is grouped by; null is the full version. */
  const [dimension, setDimension] = useState<number | null>(null);

  if (lab.loading || scope.loading) return <Spinner label="Abrindo o teste" />;
  const experiment = lab.experiments.find((item) => item.id === id);
  if (!experiment) {
    return <EmptyState title="Teste não encontrado" description="Ele pode ter sido excluído." action={<Link to="/testes" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Ver testes</Link>} />;
  }

  const dimensions = versionDimensions(variablesOf(experiment));
  const groupedBy = dimension !== null && dimension < dimensions.length ? dimension : null;
  const result = lab.resultOf(experiment, groupedBy === null ? undefined : (item) => versionPart(variantOf(item), groupedBy));
  const members = lab.membersOf(experiment.id);
  const account = scope.accounts.find((item) => item.id === experiment.accountId);
  const draftLearning = learning ?? experiment.learning;
  const today = todayIso();
  const toMeasure = new Set(pendingMeasurements(members, [experiment], today).map(({ item }) => item.record.id));
  // Each part of the test read on its own, so the winning time, model and copy are applied separately.
  const leaders: DimensionLeader[] = dimensions.flatMap((part) => {
    const byPart = dimensions.length > 1 ? lab.resultOf(experiment, (item) => versionPart(variantOf(item), part.index)) : lab.resultOf(experiment);
    const leader = byPart.leader;
    if (!leader) return [];
    const others = byPart.variants.filter((variant) => variant.label !== leader.label);
    return [{ dimension: part, leader: leader.label, runnerUp: others.length === 1 ? others[0].label : null, confidence: byPart.confidence }];
  });

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const applyWinner = async (plan: WinnerPlan) => {
    if (account && Object.keys(plan.defaults).length > 0) {
      const { id: accountId, createdAt: _c, updatedAt: _u, ...input } = account;
      await services.accounts.update(accountId, { ...input, defaults: { ...normalizeAccountDefaults(account.defaults), ...plan.defaults } });
      await scope.reload();
    }
    const saved = await lab.save(experiment, {
      ...toExperimentInput(experiment),
      learning: [experiment.learning, plan.learning].filter(Boolean).join(' '),
      appliedWinner: plan.changes.join(' · '),
      concludedAt: experiment.concludedAt ?? new Date().toISOString(),
    });
    setLearning(null);
    if (saved.id !== experiment.id) navigate(`/testes/${saved.id}`, { replace: true });
  };

  const saveExperiment = (patch: Partial<Experiment>) =>
    attempt(async () => {
      const saved = await lab.save(experiment, { ...toExperimentInput(experiment), ...patch });
      if (saved.id !== experiment.id) navigate(`/testes/${saved.id}`, { replace: true });
    });

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/testes" className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ArrowLeft className="size-4" aria-hidden /> Testes
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone={EXPERIMENT_STATUS_TONES[result.status]}>{EXPERIMENT_STATUS_LABELS[result.status]}</Badge>
            {variablesOf(experiment).map((variable) => (
              <Badge key={variable}>{TEST_VARIABLE_LABELS[variable]}</Badge>
            ))}
            <Badge>{account ? accountLabel(account) : 'Várias contas'}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{experiment.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Adicionar conteúdos
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              window.confirm('Excluir esse teste? Os conteúdos continuam salvos, só saem do teste.') &&
              void attempt(async () => {
                await lab.remove(experiment);
                navigate('/testes');
              })
            }
          >
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Button>
        </div>
      </header>

      {(error ?? lab.error) && (
        <div className="mb-4">
          <Alert>{error ?? lab.error}</Alert>
        </div>
      )}

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Card label="Hipótese" className="sm:col-span-3">
          {experiment.hypothesis || <span className="text-faint">Sem hipótese. Use Editar pra registrar o que você espera.</span>}
        </Card>
        {/* One card per tested variable; Horário is answered by the times card. */}
        {variablesOf(experiment).map((variable) => {
          const questions = VARIABLE_QUESTIONS[variable];
          if (!questions) return null;
          const sides = experiment.details?.[variable] ?? (variable === experiment.variable ? { control: experiment.control, variation: experiment.variation } : null);
          return (
            <Card key={variable} label={TEST_VARIABLE_LABELS[variable]}>
              <span className="block text-xs text-faint">{questions.control}</span>
              {sides?.control || <span className="text-faint">—</span>}
              <span className="mt-1.5 block text-xs text-faint">{questions.variation}</span>
              {sides?.variation || <span className="text-faint">—</span>}
            </Card>
          );
        })}
        <Card label="Métrica que decide">{TEST_METRIC_LABELS[experiment.goalMetric]}</Card>
        <Card label={testsTime(variablesOf(experiment)) ? 'Horários testados' : 'Horário de postagem'}>
          {experiment.times.length > 0 ? experiment.times.join(' · ') : <span className="text-faint">Sem horário definido</span>}
        </Card>
        <Card label="Período">
          {result.period ? `${formatDay(result.period.from)} a ${formatDay(result.period.to)}` : <span className="text-faint">Nada publicado ainda</span>}
        </Card>
      </section>

      <section aria-labelledby="result-title" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="result-title" className="text-base font-semibold tracking-tight text-ink">
            Resultado
          </h2>
          {dimensions.length > 1 && (
            <div role="radiogroup" aria-label="Ver resultado por" className="flex flex-wrap items-center gap-1 rounded-xl bg-subtle p-1 text-xs">
              <span className="px-2 text-faint">Ver por</span>
              {[{ label: 'Versão completa', index: null as number | null }, ...dimensions].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={groupedBy === option.index}
                  onClick={() => setDimension(option.index)}
                  className={clsx(
                    'rounded-lg px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    groupedBy === option.index ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {result.variants.length === 0 ? (
          <EmptyState title="Nenhum conteúdo no teste" description="Use “Adicionar conteúdos”, ou marque como conteúdo de teste no editor ou no Calendário." />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.variants.map((variant) => {
                const leading = result.leader?.label === variant.label;
                return (
                  <li key={variant.label} className={clsx('rounded-2xl border bg-surface p-4', leading ? 'border-emerald-400 ring-1 ring-emerald-400/40' : 'border-line')}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {leading && <Trophy className="size-4 text-amber-500" aria-label="Maior resultado" />}
                      {variant.label}
                    </p>
                    <p className="text-xs text-faint">
                      {variant.items.length} {variant.items.length === 1 ? 'conteúdo' : 'conteúdos'} · {variant.measured} com métricas
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <Metric label="Performance Score" value={variant.averageScore === null ? '—' : String(Math.round(variant.averageScore))} strong />
                      <Metric label="Share Rate" value={variant.shareRate === null ? '—' : formatPercent(variant.shareRate)} />
                      <Metric label="Save Rate" value={variant.saveRate === null ? '—' : formatPercent(variant.saveRate)} />
                      <Metric label="Follow Rate" value={variant.followRate === null ? '—' : formatPercent(variant.followRate)} />
                    </dl>
                  </li>
                );
              })}
            </ul>
            <div className={clsx('mt-4 rounded-2xl p-4 text-sm', result.leader ? 'bg-subtle' : 'border border-dashed border-line')}>
              {result.leader && (
                <p className="font-semibold text-ink">
                  Maior resultado observado: {result.leader.label}
                  {result.confidence && <span className={clsx('ml-2 font-medium', result.confidence === 'baixa' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>{CONFIDENCE_LABELS[result.confidence]}</span>}
                </p>
              )}
              <p className={clsx(result.leader ? 'mt-1 text-muted' : 'text-muted')}>{result.message}</p>
              <p className="mt-1 text-xs text-faint">{sampleProgress(result)}</p>
              <ApplyWinner experiment={experiment} leaders={leaders} hasAccount={account !== undefined} onApply={applyWinner} />
            </div>
          </>
        )}
      </section>

      {members.length > 0 && (
        <section aria-labelledby="members-title" className="mb-8">
          <h2 id="members-title" className="mb-3 text-base font-semibold tracking-tight text-ink">
            Conteúdos do teste
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {members.map((item) => (
              <li key={item.record.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/carrossel/${item.carousel?.id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {item.record.hook || item.record.title}
                  </Link>
                  <p className="text-xs text-faint">
                    <span className="font-medium text-muted">{variantOf(item)}</span> · {postingLabel(item)} · {item.carousel ? statusLabel(item.carousel) : ''}
                    {toMeasure.has(item.record.id) && <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Falta medir</span>}
                    {awaitsMeasurement(item, today) && item.record.publishedAt && <span className="ml-2 text-faint">· medir a partir de {formatDay(addDays(item.record.publishedAt, MEASURE_AFTER_DAYS))}</span>}
                  </p>
                </div>
                {item.carousel && (
                  <Button size="sm" variant="ghost" onClick={() => metrics.open(item.carousel as Carousel)}>
                    Métricas
                  </Button>
                )}
                {item.carousel && (
                  <Button size="sm" variant="ghost" onClick={() => void attempt(() => lab.assign(item.carousel as Carousel, null, ''))}>
                    Tirar do teste
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="learning-title" className="rounded-2xl border border-line bg-surface p-5">
        <h2 id="learning-title" className="text-base font-semibold tracking-tight text-ink">
          Aprendizado
        </h2>
        <p className="mt-0.5 text-xs text-muted">Fica no histórico da conta e orienta as próximas criações.</p>
        <Field label="O que esse teste ensinou?" htmlFor="learning" className="mt-3">
          <Textarea id="learning" rows={3} maxLength={EXPERIMENT_LIMITS.learning} value={draftLearning} onChange={(e) => setLearning(e.target.value)} placeholder="Ganchos contrarian tiveram mais compartilhamentos, mas ganchos de identificação trouxeram mais seguidores." />
        </Field>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {experiment.concludedAt ? (
            <>
              <Button variant="ghost" onClick={() => void saveExperiment({ concludedAt: null })}>
                Reabrir teste
              </Button>
              <Button variant="secondary" onClick={() => void saveExperiment({ learning: draftLearning })}>
                Salvar aprendizado
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void saveExperiment({ learning: draftLearning })}>
                Salvar aprendizado
              </Button>
              <Button variant="primary" disabled={!draftLearning.trim()} onClick={() => void saveExperiment({ learning: draftLearning, concludedAt: new Date().toISOString() })}>
                Concluir teste
              </Button>
            </>
          )}
        </div>
      </section>

      {editing && (
        <ExperimentForm
          initial={toExperimentInput(experiment)}
          isNew={false}
          accounts={scope.active}
          onClose={() => setEditing(false)}
          onSave={async (input) => {
            await saveExperiment(input);
            setEditing(false);
          }}
        />
      )}
      {adding && <AddContents experiment={experiment} carousels={lab.library.carousels.data} onClose={() => setAdding(false)} onAdd={(chosen, variant) => attempt(async () => { for (const carousel of chosen) await lab.assign(carousel, experiment, variant); setAdding(false); })} />}
      {metrics.dialog}
    </div>
  );
}

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function Card({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border border-line bg-surface p-4', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 text-sm text-ink">{children}</p>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className={clsx('tabular-nums', strong ? 'text-base font-semibold text-ink' : 'font-medium text-ink')}>{value}</dd>
    </div>
  );
}

interface AddContentsProps {
  experiment: Experiment;
  carousels: Carousel[];
  onClose: () => void;
  onAdd: (carousels: Carousel[], variant: string) => Promise<void>;
}

/** Pick carousels of the test's account and the version name they get. */
function AddContents({ experiment, carousels, onClose, onAdd }: AddContentsProps) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [variant, setVariant] = useState('Variação');
  const [query, setQuery] = useState('');
  const options = carousels
    .filter((carousel) => carousel.experiment?.id !== experiment.id && carousel.status !== 'archived' && (!experiment.accountId || carousel.source.accountId === experiment.accountId))
    .filter((carousel) => !query.trim() || `${carousel.title} ${carousel.slides[0]?.title ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <Dialog
      title="Adicionar conteúdos ao teste"
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={chosen.size === 0} onClick={() => void onAdd(carousels.filter((carousel) => chosen.has(carousel.id)), variant)}>
            Adicionar {chosen.size || ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Versão no teste" htmlFor="add-variant" hint="Ex.: Controle, Variação, Gancho contrarian.">
            <Input id="add-variant" value={variant} maxLength={60} onChange={(e) => setVariant(e.target.value)} />
          </Field>
          <Field label="Buscar" htmlFor="add-search">
            <Input id="add-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título ou gancho" />
          </Field>
        </div>
        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">Nenhum carrossel {experiment.accountId ? 'dessa conta ' : ''}pra adicionar.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {options.map((carousel) => (
              <li key={carousel.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={chosen.has(carousel.id)} onChange={() => toggle(carousel.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm text-ink">{carousel.slides[0]?.title.replace(/\n+/g, ' ') || carousel.title}</span>
                    <span className="text-xs text-faint">
                      {statusLabel(carousel)}
                      {carousel.experiment ? ` · já em “${carousel.experiment.name}”` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
