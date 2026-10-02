import clsx from 'clsx';
import { ArrowDown, ArrowUp, Copy, Eye, Flame, PenLine, Trophy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { Account } from '../domain/account';
import type { AnalyticsItem } from '../domain/analytics/items';
import type { AccountStat, Kpi, Scored, TemplateStat } from '../domain/analytics/summary';
import type { Asset } from '../domain/asset';
import { brandForCarousel, VISUAL_STYLE_LABELS, type BrandKit, type VisualStyle } from '../domain/brandKit';
import { statusLabel } from '../domain/carousel';
import { formatPercent, PERFORMANCE_LABELS, recordDay, CONTENT_PLATFORM_LABELS, type PerformanceKey } from '../domain/winners/record';
import { scoreBand, SCORE_BAND_INFO, type ContentScore } from '../domain/winners/score';
import { Button } from '../ui/primitives';
import { CarouselCover } from '../ui/CarouselCover';
import { formatDayBr, RecordThumb, ScoreBadge } from '../winners/WinnerCard';

/** 42,8 mil above ten thousand; whole numbers below it. */
const compact = (value: number) => (value >= 10_000 ? value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }) : Math.round(value).toLocaleString('pt-BR'));

/** Cover of a carousel, or the hook set in type for content made elsewhere. */
export function ContentThumb({ item, brands, assets, accounts }: { item: AnalyticsItem; brands: BrandKit[]; assets: Asset[]; accounts: Account[] }) {
  const brand = item.carousel ? brandForCarousel(item.carousel, brands, accounts) : null;
  if (item.carousel && brand && item.carousel.slides.length > 0) return <CarouselCover carousel={item.carousel} brand={brand} assets={assets} accounts={accounts} />;
  return <RecordThumb record={item.record} carousel={null} brand={null} assets={assets} accounts={accounts} />;
}

export function KpiGrid({ published, kpis, rates }: { published: number; kpis: Kpi[]; rates: Partial<Record<PerformanceKey, number | null>> }) {
  const visible = kpis.filter((kpi) => kpi.measured > 0);
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <KpiCard label="Conteúdos publicados" value={published.toLocaleString('pt-BR')} />
      {visible.map((kpi) => (
        <KpiCard
          key={kpi.key}
          label={PERFORMANCE_LABELS[kpi.key]}
          value={`${kpi.key === 'follows' ? '+' : ''}${kpi.key === 'revenue' ? kpi.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : compact(kpi.total)}`}
          detail={rates[kpi.key] != null ? `${formatPercent(rates[kpi.key] as number)} das visualizações` : undefined}
        />
      ))}
    </dl>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd>
      {detail && <dd className="mt-0.5 text-[11px] text-faint">{detail}</dd>}
    </div>
  );
}

interface ItemActionsProps {
  onView: () => void;
  onVary: () => void;
  varyLabel?: string;
}

function ItemActions({ onView, onVary, varyLabel = 'Criar variação' }: ItemActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={onView}>
        <Eye className="size-3.5" aria-hidden /> Ver conteúdo
      </Button>
      <Button size="sm" variant="primary" onClick={onVary}>
        <Copy className="size-3.5" aria-hidden /> {varyLabel}
      </Button>
    </div>
  );
}

const HEADLINE_KEYS: PerformanceKey[] = ['views', 'shares', 'saves', 'follows'];
const HEADLINE_LABELS: Partial<Record<PerformanceKey, string>> = { views: 'Views', shares: 'Compartilhamentos', saves: 'Salvos', follows: 'Seguidores' };

function Headline({ item }: { item: AnalyticsItem }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {HEADLINE_KEYS.filter((key) => item.record.metrics[key] !== null).map((key) => (
        <div key={key} className="flex items-baseline justify-between gap-2">
          <dt className="text-faint">{HEADLINE_LABELS[key]}</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {key === 'follows' ? '+' : ''}
            {compact(item.record.metrics[key] ?? 0)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface ShowcaseProps {
  entry: Scored;
  thumb: ReactNode;
  accountLabel: string;
  scoreDetail: ContentScore | null;
  onView: () => void;
  onVary: () => void;
}

export function ChampionCard({ entry, thumb, accountLabel, scoreDetail, onView, onVary }: ShowcaseProps) {
  const record = entry.item.record;
  return (
    <section aria-labelledby="champion-title" className="grid gap-5 rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-surface p-5 sm:grid-cols-[150px_minmax(0,1fr)] dark:border-amber-500/30 dark:from-amber-950/30">
      <div className="mx-auto w-36 overflow-hidden rounded-xl ring-1 ring-line sm:mx-0 sm:w-full">{thumb}</div>
      <div className="flex min-w-0 flex-col gap-3">
        <h2 id="champion-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <Trophy className="size-4" aria-hidden /> Campeão da semana
        </h2>
        <p className="text-balance text-lg font-semibold leading-snug tracking-tight text-ink">“{record.hook || record.title}”</p>
        <p className="text-xs text-muted">
          {accountLabel} · {CONTENT_PLATFORM_LABELS[record.platform]} · {formatDayBr(recordDay(record))}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ScoreBadge score={scoreDetail} size="lg" />
          <span className="text-xs text-muted">Performance Score · {SCORE_BAND_INFO[scoreBand(entry.score)].label}</span>
        </div>
        <Headline item={entry.item} />
        <ItemActions onView={onView} onVary={onVary} varyLabel="Criar conteúdos parecidos" />
      </div>
    </section>
  );
}

export function WinnerTile({ entry, thumb, accountLabel, scoreDetail, onView, onVary }: ShowcaseProps) {
  const record = entry.item.record;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative border-b border-line">
        {thumb}
        <div className="absolute right-3 top-3">
          <ScoreBadge score={scoreDetail} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">“{record.hook || record.title}”</p>
        <p className="truncate text-xs text-muted">
          {accountLabel} · {CONTENT_PLATFORM_LABELS[record.platform]}
        </p>
        <Headline item={entry.item} />
        <div className="mt-auto">
          <ItemActions onView={onView} onVary={onVary} />
        </div>
      </div>
    </li>
  );
}

export function TemplateCard({ stat, winner, thumb }: { stat: TemplateStat; winner: boolean; thumb: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">{thumb}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink">{VISUAL_STYLE_LABELS[stat.template as VisualStyle] ?? stat.template}</p>
          {winner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/12 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300">
              <Flame className="size-3" aria-hidden /> Template vencedor
            </span>
          )}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Pair label="Usado" value={`${stat.uses}x`} />
          <Pair label="Score médio" value={stat.averageScore === null ? '—' : String(Math.round(stat.averageScore))} />
          <Pair label="Views médias" value={stat.averageViews === null ? '—' : compact(stat.averageViews)} />
          <Pair label="Save Rate" value={stat.saveRate === null ? '—' : formatPercent(stat.saveRate)} />
          <Pair label="Share Rate" value={stat.shareRate === null ? '—' : formatPercent(stat.shareRate)} />
          <Pair label="Medidos" value={String(stat.measured)} />
        </dl>
      </div>
    </li>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export function AccountComparison({ stats, label }: { stats: AccountStat[]; label: (key: string) => string }) {
  const best = (pick: (stat: AccountStat) => number | null) => {
    const values = stats.map(pick).filter((value): value is number => value !== null);
    return values.length > 1 ? Math.max(...values) : null;
  };
  const top = { views: best((stat) => stat.viewsPerPost), share: best((stat) => stat.shareRate), save: best((stat) => stat.saveRate), follow: best((stat) => stat.followRate) };
  const cell = (value: number | null, isTop: boolean, format: (value: number) => string) => (
    <td className={clsx('py-2.5 text-right tabular-nums', isTop ? 'font-semibold text-ink' : 'text-muted')}>{value === null ? '—' : `${isTop ? '▲ ' : ''}${format(value)}`}</td>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-faint">
            <th scope="col" className="pb-2 font-medium">Conta</th>
            <th scope="col" className="pb-2 text-right font-medium">Posts</th>
            <th scope="col" className="pb-2 text-right font-medium">Views</th>
            <th scope="col" className="pb-2 text-right font-medium">Views por post</th>
            <th scope="col" className="pb-2 text-right font-medium">Share Rate</th>
            <th scope="col" className="pb-2 text-right font-medium">Save Rate</th>
            <th scope="col" className="pb-2 text-right font-medium">Follow Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {stats.map((stat) => (
            <tr key={stat.account}>
              <td className="max-w-[220px] truncate py-2.5 pr-3 font-medium text-ink">{label(stat.account)}</td>
              <td className="py-2.5 text-right tabular-nums text-muted">{stat.posts}</td>
              <td className="py-2.5 text-right tabular-nums text-muted">{compact(stat.views)}</td>
              {cell(stat.viewsPerPost, stat.viewsPerPost !== null && stat.viewsPerPost === top.views, compact)}
              {cell(stat.shareRate, stat.shareRate !== null && stat.shareRate === top.share, formatPercent)}
              {cell(stat.saveRate, stat.saveRate !== null && stat.saveRate === top.save, formatPercent)}
              {cell(stat.followRate, stat.followRate !== null && stat.followRate === top.follow, formatPercent)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABLE_COLUMNS: { key: PerformanceKey | 'score' | 'date'; label: string }[] = [
  { key: 'date', label: 'Data' },
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Coment.' },
  { key: 'shares', label: 'Compart.' },
  { key: 'saves', label: 'Salvos' },
  { key: 'follows', label: 'Seguid.' },
  { key: 'score', label: 'Score' },
];

type SortKey = (typeof TABLE_COLUMNS)[number]['key'];

interface RankingTableProps {
  items: AnalyticsItem[];
  scoreOf: (item: AnalyticsItem) => number | null;
  accountLabel: (item: AnalyticsItem) => string;
  onOpen: (item: AnalyticsItem) => void;
  onMetrics: (item: AnalyticsItem) => void;
}

/** Every content of the filter, sortable by any column. Contents without a number go to the end. */
export function RankingTable({ items, scoreOf, accountLabel, onOpen, onMetrics }: RankingTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'score', desc: true });
  const valueOf = (item: AnalyticsItem, key: SortKey): number | string | null =>
    key === 'score' ? scoreOf(item) : key === 'date' ? recordDay(item.record) : item.record.metrics[key];
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const left = valueOf(a, sort.key);
      const right = valueOf(b, sort.key);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const order = typeof left === 'string' ? left.localeCompare(String(right)) : left - (right as number);
      return sort.desc ? -order : order;
    });
  }, [items, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: SortKey) => setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: true }));

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-line">
          <tr className="text-left text-xs text-faint">
            <th scope="col" className="px-4 py-3 font-medium">Conteúdo</th>
            <th scope="col" className="px-2 py-3 font-medium">Conta</th>
            {TABLE_COLUMNS.map((column) => (
              <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : 'none'} className="px-2 py-3 text-right font-medium">
                <button type="button" onClick={() => toggle(column.key)} className="inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {column.label}
                  {sort.key === column.key && (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
                </button>
              </th>
            ))}
            <th scope="col" className="px-2 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((item) => {
            const score = scoreOf(item);
            return (
              <tr key={item.record.id} className="hover:bg-subtle/60">
                <td className="max-w-[260px] px-4 py-2.5">
                  <button type="button" onClick={() => onOpen(item)} className="line-clamp-1 text-left font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {item.record.hook || item.record.title}
                  </button>
                </td>
                <td className="max-w-[160px] truncate px-2 py-2.5 text-muted">{accountLabel(item)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted">{formatDayBr(recordDay(item.record)).slice(0, 5)}</td>
                {(['views', 'likes', 'comments', 'shares', 'saves', 'follows'] as PerformanceKey[]).map((key) => (
                  <td key={key} className="px-2 py-2.5 text-right tabular-nums text-ink">
                    {item.record.metrics[key] === null ? <span className="text-faint">—</span> : compact(item.record.metrics[key] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-2.5 text-right">{score === null ? <span className="text-faint">—</span> : <span className="font-semibold tabular-nums text-ink">{score}</span>}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-xs text-muted">{item.carousel ? statusLabel(item.carousel) : item.record.winner ? 'Vencedor' : 'Publicado'}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onMetrics(item)} aria-label={`Métricas de ${item.record.title}`}>
                    <PenLine className="size-3.5" aria-hidden /> Métricas
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">{children}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
