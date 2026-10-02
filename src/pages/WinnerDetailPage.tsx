import clsx from 'clsx';
import { ArrowLeft, Copy, Eye, Heart, PenLine, Pencil, Sparkles, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { winnerContext } from '../application/winnerHandoff';
import { productOf } from '../domain/brandKit';
import { STATUS_LABELS } from '../domain/carousel';
import { CONTENT_TYPE_LABELS, OBJECTIVE_LABELS } from '../domain/content';
import { analyzeDna, type ContentDna } from '../domain/winners/dna';
import { familyMembers, familyNames, type FamilyMember } from '../domain/winners/family';
import { carouselScript, recordFromCarousel } from '../domain/winners/fromCarousel';
import { formatAnalysisValue, metricValue, type AnalysisMetric } from '../domain/winners/insights';
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  conversionRate,
  formatMetric,
  formatPercent,
  HOOK_TYPE_LABELS,
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  PILLAR_LABELS,
  PRODUCT_PRESENCE_LABELS,
  recordDay,
  toRecordInput,
  WINNER_TYPE_INFO,
  type ContentRecord,
  type PerformanceMetrics,
} from '../domain/winners/record';
import { scoreBand, SCORE_BAND_INFO } from '../domain/winners/score';
import { Alert, Button, EmptyState, Spinner } from '../ui/primitives';
import { Chip, Tag } from '../winners/chips';
import { DnaPanel } from '../winners/DnaPanel';
import { MetricSelect } from '../winners/MetricSelect';
import { useWinnerActions } from '../winners/useWinnerActions';
import { accountLabelOf, useWinnerLibrary } from '../winners/useWinnerLibrary';
import { formatDayBr, RecordThumb, ScoreBadge } from '../winners/WinnerCard';

const TABS = [
  { id: 'estrutura', label: 'Estrutura' },
  { id: 'familia', label: 'Família' },
  { id: 'metricas', label: 'Métricas' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function WinnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const library = useWinnerLibrary();
  const actions = useWinnerActions(library);
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((item) => item.id === params.get('aba'))?.id ?? 'estrutura';
  const { records, carousels, accounts, brands, assets } = library;

  const record = records.data.find((item) => item.id === id);
  if (library.loading) return <Spinner label="Abrindo o vencedor" />;
  if (!record) {
    return (
      <EmptyState
        title="Conteúdo não encontrado"
        description="Ele pode ter sido excluído."
        action={<Link to="/vencedores" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Ver vencedores</Link>}
      />
    );
  }

  const context = winnerContext(record, carousels.data, accounts.data, brands.data);
  const score = library.scoreOf(record.metrics);
  const accountLabel = accountLabelOf(record, accounts.data);
  const productName = context.brand ? (productOf(context.brand)?.name ?? null) : null;

  const reanalyze = async () => {
    const script = context.carousel ? carouselScript(context.carousel) : record.script;
    const dna = analyzeDna({ beats: script, caption: context.carousel?.caption, productName, visualStyle: record.dna?.visualStyle ?? null });
    await actions.patch(record, { script, dna, slideCount: record.slideCount ?? script.length });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/vencedores" className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ArrowLeft className="size-4" aria-hidden /> Modelos Vencedores
      </Link>

      <header className="mb-8 grid gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative mx-auto w-44 self-start overflow-hidden rounded-2xl border border-line sm:mx-0 sm:w-full">
          <RecordThumb record={record} carousel={context.carousel} brand={context.brand} assets={assets.data} accounts={accounts.data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {record.mainModel && <Tag tone="accent">🏆 Modelo principal</Tag>}
              {record.winner && <Tag tone="strong">⭐ Vencedor</Tag>}
              {record.winnerTypes.map((type) => (
                <Tag key={type} tone="strong">
                  {WINNER_TYPE_INFO[type].emoji} {WINNER_TYPE_INFO[type].short}
                </Tag>
              ))}
            </div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">“{record.hook || record.title}”</h1>
            {record.title !== record.hook && <p className="mt-1 text-sm text-muted">{record.title}</p>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Tag>{accountLabel ?? CONTENT_PLATFORM_LABELS[record.platform]}</Tag>
            <Tag>{CONTENT_FORMAT_LABELS[record.format]}</Tag>
            {record.objective && <Tag tone="accent">Objetivo: {OBJECTIVE_LABELS[record.objective]}</Tag>}
            {record.contentType && <Tag>Tipo: {CONTENT_TYPE_LABELS[record.contentType]}</Tag>}
            {record.theme && <Tag>Tema: {record.theme}</Tag>}
            {record.pillar && <Tag>{PILLAR_LABELS[record.pillar]}</Tag>}
            {record.hookType && <Tag>Gancho: {HOOK_TYPE_LABELS[record.hookType]}</Tag>}
            {record.productPresence && <Tag>{PRODUCT_PRESENCE_LABELS[record.productPresence]}</Tag>}
            <Tag>{formatDayBr(recordDay(record))}</Tag>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {score && (
              <span className="inline-flex items-center gap-2">
                <ScoreBadge score={score} size="lg" />
                <span className="text-xs text-muted">Content Score · {SCORE_BAND_INFO[scoreBand(score.value)].label}</span>
              </span>
            )}
            <Chip active={record.favorite} onClick={() => actions.run('favorite', record)}>
              <Heart className={clsx('size-3.5', record.favorite && 'fill-current')} aria-hidden /> Favorito
            </Chip>
            <Chip active={record.mainModel} onClick={() => actions.run('mainModel', record)}>
              <Trophy className="size-3.5" aria-hidden /> Modelo principal
            </Chip>
            {!record.winner && (
              <Chip active={false} onClick={() => void actions.patch(record, { winner: true })}>
                ⭐ Marcar como vencedor
              </Chip>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => actions.run('model', record)}>
              <Sparkles className="size-4" aria-hidden /> Usar como modelo
            </Button>
            <Button variant="secondary" onClick={() => actions.run('variations', record)}>
              <Copy className="size-4" aria-hidden /> Criar variações
            </Button>
            <Button variant="secondary" onClick={() => actions.run('family', record)}>
              <Users className="size-4" aria-hidden /> Criar família
            </Button>
            {context.carousel && (
              <Button variant="ghost" onClick={() => actions.run('view', record)}>
                <Eye className="size-4" aria-hidden /> Ver conteúdo
              </Button>
            )}
            <Button variant="ghost" onClick={() => actions.run('edit', record)}>
              <Pencil className="size-4" aria-hidden /> Editar métricas
            </Button>
            {record.winner && (
              <Button variant="danger" onClick={() => actions.run('unmark', record)}>
                Remover dos vencedores
              </Button>
            )}
          </div>
        </div>
      </header>

      {(actions.error ?? library.error) && (
        <div className="mb-4">
          <Alert>{actions.error ?? library.error}</Alert>
        </div>
      )}

      <div role="tablist" aria-label="Detalhes" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setParams(item.id === 'estrutura' ? {} : { aba: item.id }, { replace: true })}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              tab === item.id ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'estrutura' && <DnaPanel dna={record.dna} script={record.script} onSave={(dna: ContentDna) => actions.patch(record, { dna })} onReanalyze={reanalyze} />}
        {tab === 'familia' && <FamilyTab record={record} library={library} onCreate={(mode) => actions.run(mode, record)} onResults={(member) => openResults(member)} scoreOf={library.scoreValue} />}
        {tab === 'metricas' && <MetricsTab record={record} />}
      </div>

      {actions.dialogs}
    </div>
  );

  function openResults(member: FamilyMember) {
    if (member.record) return actions.openForm(toRecordInput(member.record), member.record.id, 'Resultados da variação');
    const account = accounts.data.find((item) => item.id === member.carousel.source.accountId) ?? null;
    const initial = { ...recordFromCarousel(member.carousel, account, productName), winner: false, theme: '' };
    actions.openForm(initial, null, 'Resultados da variação');
  }
}

interface FamilyTabProps {
  record: ContentRecord;
  library: ReturnType<typeof useWinnerLibrary>;
  onCreate: (mode: 'variations' | 'family') => void;
  onResults: (member: FamilyMember) => void;
  scoreOf: (metrics: PerformanceMetrics) => number | null;
}

function FamilyTab({ record, library, onCreate, onResults, scoreOf }: FamilyTabProps) {
  const [metric, setMetric] = useState<AnalysisMetric>('views');
  const members = useMemo(() => familyMembers(record.id, library.carousels.data, library.records.data), [record.id, library.carousels.data, library.records.data]);
  const valueOf = (metrics: PerformanceMetrics | null) => (metrics ? metricValue(metrics, metric, scoreOf) : null);
  const best = members.reduce<{ id: string; value: number } | null>((top, member) => {
    const value = valueOf(member.metrics);
    return value !== null && (!top || value > top.value) ? { id: member.carousel.id, value } : top;
  }, null);
  const original = valueOf(record.metrics);

  if (members.length === 0) {
    return (
      <EmptyState
        title="Nenhum conteúdo criado a partir dele ainda"
        description="Variações e famílias criadas daqui ficam ligadas a esse vencedor. Depois de publicar, lance os resultados pra descobrir qual versão do mecanismo funciona melhor."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => onCreate('variations')}>
              Criar variações
            </Button>
            <Button variant="secondary" onClick={() => onCreate('family')}>
              Criar família
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {members.length} {members.length === 1 ? 'conteúdo criado' : 'conteúdos criados'} a partir desse vencedor ·{' '}
          {members.filter((member) => member.metrics).length} com resultado
        </p>
        <MetricSelect value={metric} onChange={setMetric} id="family-metric" />
      </div>

      <div className="flex items-center justify-between rounded-xl bg-subtle px-4 py-3 text-sm">
        <span className="text-muted">Original</span>
        <span className="font-semibold tabular-nums text-ink">{original === null ? '—' : formatAnalysisValue(metric, original)}</span>
      </div>

      {familyNames(members).map((name) => (
        <section key={name || '__loose__'} aria-label={name || 'Modelos e variações'}>
          <h3 className="mb-2 text-sm font-semibold text-ink">{name || 'Modelos e variações'}</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {members
              .filter((member) => (member.carousel.origin?.family ?? '') === name)
              .map((member) => {
                const value = valueOf(member.metrics);
                const isBest = best?.id === member.carousel.id && members.filter((item) => item.metrics).length > 1;
                return (
                  <li key={member.carousel.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/carrossel/${member.carousel.id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        {isBest && '🏆 '}
                        {member.carousel.title}
                      </Link>
                      <p className="text-xs text-faint">
                        {STATUS_LABELS[member.carousel.status]}
                        {member.record?.winner && ' · ⭐ vencedor'}
                      </p>
                    </div>
                    <span className={clsx('w-24 text-right text-sm tabular-nums', value === null ? 'text-faint' : 'font-semibold text-ink')}>
                      {value === null ? '—' : formatAnalysisValue(metric, value)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => onResults(member)}>
                      <PenLine className="size-3.5" aria-hidden /> {member.record ? 'Editar' : 'Lançar'} resultados
                    </Button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MetricsTab({ record }: { record: ContentRecord }) {
  const views = record.metrics.views;
  const rate = (value: number | null) => (value !== null && views ? formatPercent(value / views) : null);
  const conversion = conversionRate(record.metrics);
  const derived = [
    { label: 'Salvamentos por visualização', value: rate(record.metrics.saves) },
    { label: 'Compartilhamentos por visualização', value: rate(record.metrics.shares) },
    { label: 'Visitas ao perfil por visualização', value: rate(record.metrics.profileVisits) },
    { label: 'Taxa de conversão', value: conversion === null ? null : formatPercent(conversion) },
  ].filter((item) => item.value !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="metrics-attention">
        <h3 id="metrics-attention" className="mb-3 text-sm font-semibold text-ink">
          Números
        </h3>
        <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {PERFORMANCE_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-sm text-muted">{PERFORMANCE_LABELS[key]}</dt>
              <dd className={clsx('text-sm tabular-nums', record.metrics[key] === null ? 'text-faint' : 'font-semibold text-ink')}>
                {record.metrics[key] === null ? 'não medido' : formatMetric(key, record.metrics[key] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="flex flex-col gap-6">
        {derived.length > 0 && (
          <section aria-labelledby="metrics-rates">
            <h3 id="metrics-rates" className="mb-3 text-sm font-semibold text-ink">
              Atenção e conversão, separadas
            </h3>
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {derived.map((item) => (
                <div key={item.label} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-sm text-muted">{item.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {record.notes && (
          <section aria-labelledby="metrics-notes">
            <h3 id="metrics-notes" className="mb-3 text-sm font-semibold text-ink">
              Observações
            </h3>
            <p className="whitespace-pre-line rounded-2xl bg-subtle p-4 text-sm text-ink">{record.notes}</p>
          </section>
        )}
      </div>
    </div>
  );
}
