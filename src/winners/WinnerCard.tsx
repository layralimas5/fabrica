import clsx from 'clsx';
import { Copy, Dna, Eye, Heart, MoreHorizontal, Pencil, Sparkles, Trophy, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  formatMetric,
  HOOK_TYPE_LABELS,
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  recordDay,
  WINNER_TYPE_INFO,
  WINNER_TYPE_METRICS,
  type ContentRecord,
  type PerformanceKey,
} from '../domain/winners/record';
import { CONTENT_TYPE_LABELS, OBJECTIVE_LABELS } from '../domain/content';
import { scoreBand, SCORE_BAND_INFO, type ContentScore } from '../domain/winners/score';
import { CarouselCover } from '../ui/CarouselCover';
import { Tag } from './chips';

export type CardAction = 'view' | 'structure' | 'variations' | 'model' | 'family' | 'edit' | 'unmark' | 'favorite' | 'mainModel';

interface WinnerCardProps {
  record: ContentRecord;
  carousel: Carousel | null;
  brand: BrandKit | null;
  assets: Asset[];
  accounts: Account[];
  accountLabel: string | null;
  score: ContentScore | null;
  /** Metric the list is sorted by: it leads the card. */
  focus: PerformanceKey | null;
  onAction: (action: CardAction) => void;
}

const MAX_CARD_METRICS = 4;

/** The metrics that made it win first, then the rest that was measured. */
export function cardMetrics(record: ContentRecord, focus: PerformanceKey | null): PerformanceKey[] {
  const priority = [...(focus ? [focus] : []), ...record.winnerTypes.flatMap((type) => WINNER_TYPE_METRICS[type]), ...PERFORMANCE_KEYS];
  return [...new Set(priority)].filter((key) => record.metrics[key] !== null).slice(0, MAX_CARD_METRICS);
}

export function formatDayBr(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

export function ScoreBadge({ score, size = 'sm' }: { score: ContentScore | null; size?: 'sm' | 'lg' }) {
  if (!score) return null;
  const band = SCORE_BAND_INFO[scoreBand(score.value)];
  return (
    <span
      title={`Content Score ${score.value}/100 · ${band.label} · baseado em ${score.basis} métricas, comparado com a sua biblioteca`}
      className={clsx('inline-flex items-center gap-1 rounded-full bg-surface/95 font-semibold tabular-nums text-ink shadow-sm ring-1 ring-line', size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-8 px-3 text-sm')}
    >
      <span aria-hidden>{band.emoji}</span>
      {score.value}
      <span className="sr-only">de 100, {band.label}</span>
    </span>
  );
}

/** Thumbnail: the carousel cover when it exists, otherwise the hook set in type. */
export function RecordThumb({ record, carousel, brand, assets, accounts }: Pick<WinnerCardProps, 'record' | 'carousel' | 'brand' | 'assets' | 'accounts'>) {
  if (carousel && brand && carousel.slides.length > 0) return <CarouselCover carousel={carousel} brand={brand} assets={assets} accounts={accounts} />;
  return (
    <div className="flex aspect-[4/5] w-full flex-col justify-between bg-gradient-to-br from-subtle to-surface p-5 pb-12">
      <span className="text-[11px] font-medium uppercase tracking-wider text-faint">{CONTENT_FORMAT_LABELS[record.format]}</span>
      <p className="line-clamp-6 text-balance text-lg font-semibold leading-snug tracking-tight text-ink">{record.hook || record.title}</p>
    </div>
  );
}

export function WinnerCard({ record, carousel, brand, assets, accounts, accountLabel, score, focus, onAction }: WinnerCardProps) {
  const metrics = cardMetrics(record, focus);
  const [lead, ...rest] = metrics;

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-md">
      <Link to={`/vencedores/${record.id}`} className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
        <div className="relative overflow-hidden border-b border-line">
          <RecordThumb record={record} carousel={carousel} brand={brand} assets={assets} accounts={accounts} />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            {record.mainModel && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-amber-950 shadow-sm">🏆 Modelo</span>}
            {record.winner && !record.mainModel && <span className="rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm ring-1 ring-line">⭐ Vencedor</span>}
          </div>
          <div className="absolute bottom-3 right-3">
            <ScoreBadge score={score} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">“{record.hook || record.title}”</p>
            {record.hook && record.title !== record.hook && <p className="mt-0.5 truncate text-xs text-faint">{record.title}</p>}
          </div>

          <div className="flex flex-wrap gap-1">
            {record.winnerTypes.map((type) => (
              <Tag key={type} tone="strong">
                {WINNER_TYPE_INFO[type].emoji} {WINNER_TYPE_INFO[type].short}
              </Tag>
            ))}
            <Tag>{accountLabel ?? CONTENT_PLATFORM_LABELS[record.platform]}</Tag>
            <Tag>{CONTENT_FORMAT_LABELS[record.format]}</Tag>
            {record.objective && <Tag tone="accent">{OBJECTIVE_LABELS[record.objective]}</Tag>}
            {record.contentType && <Tag>{CONTENT_TYPE_LABELS[record.contentType]}</Tag>}
            {record.theme && <Tag>{record.theme}</Tag>}
            {record.hookType && <Tag>{HOOK_TYPE_LABELS[record.hookType]}</Tag>}
          </div>

          {lead ? (
            <dl className="mt-auto">
              <div className="flex items-baseline gap-1.5">
                <dd className="text-xl font-semibold tabular-nums tracking-tight text-ink">{formatMetric(lead, record.metrics[lead] ?? 0)}</dd>
                <dt className="text-xs text-muted">{PERFORMANCE_LABELS[lead].toLowerCase()}</dt>
              </div>
              {rest.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {rest.map((key) => (
                    <div key={key} className="flex items-baseline gap-1 text-xs">
                      <dd className="font-medium tabular-nums text-ink">{formatMetric(key, record.metrics[key] ?? 0)}</dd>
                      <dt className="text-faint">{PERFORMANCE_LABELS[key].toLowerCase()}</dt>
                    </div>
                  ))}
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-auto text-xs text-faint">Sem métricas ainda</p>
          )}
          <p className="text-[11px] text-faint">{formatDayBr(recordDay(record))}</p>
        </div>
      </Link>

      <div className="absolute right-3 top-3 flex gap-1.5">
        <IconToggle active={record.favorite} label={record.favorite ? 'Tirar dos favoritos' : 'Favoritar'} onClick={() => onAction('favorite')}>
          <Heart className={clsx('size-3.5', record.favorite && 'fill-current text-rose-500')} aria-hidden />
        </IconToggle>
        <ActionsMenu title={record.title} onAction={onAction} mainModel={record.mainModel} />
      </div>
    </li>
  );
}

function IconToggle({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full bg-surface/95 text-muted shadow-sm ring-1 ring-line transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}

const MENU: { action: CardAction; label: string; icon: typeof Eye }[] = [
  { action: 'view', label: 'Ver conteúdo', icon: Eye },
  { action: 'structure', label: 'Ver estrutura', icon: Dna },
  { action: 'variations', label: 'Criar variações', icon: Copy },
  { action: 'model', label: 'Usar como modelo', icon: Sparkles },
  { action: 'family', label: 'Criar família', icon: Users },
  { action: 'edit', label: 'Editar métricas', icon: Pencil },
];

function ActionsMenu({ title, onAction, mainModel }: { title: string; onAction: (action: CardAction) => void; mainModel: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = (action: CardAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <div ref={ref} className="relative">
      <IconToggle active={open} label={`Ações de ${title}`} onClick={() => setOpen((current) => !current)}>
        <MoreHorizontal className="size-4" aria-hidden />
      </IconToggle>
      {open && (
        <div role="menu" aria-label={`Ações de ${title}`} className="absolute right-0 top-10 z-10 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {MENU.map(({ action, label, icon: Icon }) => (
            <MenuItem key={action} onClick={() => run(action)} icon={<Icon className="size-4" aria-hidden />}>
              {label}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-line" />
          <MenuItem onClick={() => run('mainModel')} icon={<Trophy className="size-4" aria-hidden />}>
            {mainModel ? 'Tirar de modelo principal' : 'Marcar como modelo principal'}
          </MenuItem>
          <MenuItem onClick={() => run('unmark')} icon={<XCircle className="size-4" aria-hidden />} danger>
            Remover dos vencedores
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, icon, children, danger = false }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors focus-visible:bg-subtle focus-visible:outline-none',
        danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40' : 'text-ink hover:bg-subtle',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
