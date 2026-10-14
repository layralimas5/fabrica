import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, ImageOff, Info, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import { brandForCarousel, type BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { signedPercent, type KpiValue } from '../domain/dashboard/dashboard';
import type { DashItem } from '../domain/dashboard/items';
import { CarouselCover } from '../ui/CarouselCover';

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('min-w-0 rounded-2xl border border-line bg-surface p-5', className)} aria-label={title}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Up or down against the previous period, with an icon and a sign so it never relies on color. */
export function ChangeBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-faint">sem base de comparação</span>;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', value === 0 ? 'text-muted' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
      <Icon className="size-3.5" aria-hidden />
      {signedPercent(value)} <span className="font-normal text-faint">vs. período anterior</span>
    </span>
  );
}

interface KpiCardProps {
  label: string;
  kpi: KpiValue | null;
  format: (value: number) => string;
  /** What the number is and how it is computed: opened from the info button. */
  definition: string;
  /** Replaces the coverage line, e.g. for numbers that do not come from posts. */
  note?: string;
  unavailable?: string;
}

export function KpiCard({ label, kpi, format, definition, note, unavailable = 'Indisponível' }: KpiCardProps) {
  const value = kpi?.value ?? null;
  return (
    <article className="relative flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        <details className="group">
          <summary aria-label={`Como ${label} é calculado`} className="grid size-6 cursor-pointer list-none place-items-center rounded-md text-faint hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <Info className="size-3.5" aria-hidden />
          </summary>
          <p className="absolute inset-x-2 top-10 z-20 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-muted shadow-lg">{definition}</p>
        </details>
      </div>
      <p className={clsx('mt-1 truncate font-semibold tracking-tight', value === null ? 'text-base text-faint' : 'text-2xl text-ink')}>{value === null ? unavailable : format(value)}</p>
      <div className="mt-1.5 flex min-h-5 flex-col gap-0.5">
        {value !== null && kpi && <ChangeBadge value={kpi.change} />}
        <p className="text-[11px] text-faint">{note ?? (kpi && kpi.total > 0 ? `em ${kpi.covered} de ${kpi.total} ${kpi.total === 1 ? 'post' : 'posts'}` : 'nenhum post no período')}</p>
      </div>
    </article>
  );
}

interface ThumbProps {
  item: DashItem;
  carousels: Carousel[];
  brands: BrandKit[];
  assets: Asset[];
  accounts: Account[];
  className?: string;
}

/** The real image of the post: the network's thumbnail, the cover of the Fábrica's carousel, or a plain tile. */
export function ContentThumb({ item, carousels, brands, assets, accounts, className = 'size-12' }: ThumbProps) {
  if (item.thumbnailUrl) {
    return <img src={item.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className={clsx('shrink-0 rounded-lg bg-subtle object-cover', className)} />;
  }
  const carousel = item.carouselId ? carousels.find((entry) => entry.id === item.carouselId) : undefined;
  const brand = carousel ? brandForCarousel(carousel, brands, accounts) : null;
  if (carousel && brand) {
    return (
      <div className={clsx('shrink-0 overflow-hidden rounded-lg', className)}>
        <CarouselCover carousel={carousel} brand={brand} assets={assets} accounts={accounts} scale={0.12} className="!aspect-square !h-full !w-full" />
      </div>
    );
  }
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-lg bg-subtle text-faint', className)} aria-hidden>
      <ImageOff className="size-4" />
    </span>
  );
}

export function SourceBadge({ source }: { source: DashItem['source'] }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        source === 'api' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-subtle text-muted',
      )}
      title={source === 'api' ? 'Números lidos da API oficial na última sincronização' : 'Números lançados à mão no Analytics'}
    >
      {source === 'api' ? 'API' : 'Manual'}
    </span>
  );
}
