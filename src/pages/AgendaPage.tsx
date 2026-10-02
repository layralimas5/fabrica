import clsx from 'clsx';
import { CalendarDays, CheckCheck, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { renderContextFor } from '../app/renderContextFor';
import { useAccounts, useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import { isPosted, postedStatus, STATUS_LABELS, toCarouselInput, type Carousel } from '../domain/carousel';
import { formatDay, isIsoDate, todayIso } from '../domain/schedule';
import { CarouselCover } from '../ui/CarouselCover';
import { PostedToggle } from '../ui/PostedToggle';
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '../ui/primitives';

interface DayGroup {
  date: string;
  carousels: Carousel[];
}

/** Scheduled carousels by day: late ones first, then today onward. */
function groupByDay(carousels: Carousel[], today: string): { late: DayGroup[]; upcoming: DayGroup[]; unscheduled: Carousel[] } {
  const byDay = new Map<string, Carousel[]>();
  const unscheduled: Carousel[] = [];
  for (const carousel of carousels) {
    if (!carousel.scheduledFor) unscheduled.push(carousel);
    else byDay.set(carousel.scheduledFor, [...(byDay.get(carousel.scheduledFor) ?? []), carousel]);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, items]) => ({ date, carousels: items }));
  const late = days
    .filter((day) => day.date < today)
    .map((day) => ({ ...day, carousels: day.carousels.filter((carousel) => carousel.status !== 'published') }))
    .filter((day) => day.carousels.length > 0);
  return { late, upcoming: days.filter((day) => day.date >= today), unscheduled };
}

export function AgendaPage() {
  const services = useServices();
  const carousels = useCarousels();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();
  const [projectFilter, setProjectFilter] = useState('');
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const created = (useLocation().state as { created?: number } | null)?.created;
  const today = todayIso();

  const projects = useMemo(() => [...new Set(carousels.data.map((carousel) => carousel.project).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [carousels.data]);
  const visible = useMemo(() => carousels.data.filter((carousel) => !projectFilter || carousel.project === projectFilter), [carousels.data, projectFilter]);
  const groups = useMemo(() => groupByDay(visible, today), [visible, today]);

  if (carousels.loading || brands.loading || assets.loading || accounts.loading) return <Spinner />;

  const save = async (carousel: Carousel, patch: Partial<Carousel>) => {
    const next = { ...carousel, ...patch };
    try {
      const saved = await services.carousels.update(carousel.id, toCarouselInput(next));
      carousels.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const downloadDay = async (day: DayGroup) => {
    const items = day.carousels.flatMap((carousel) => {
      const brand = brands.data.find((kit) => kit.id === carousel.brandKitId);
      return brand ? [{ carousel, context: renderContextFor(carousel, brand, assets.data, services.assets, accounts.data) }] : [];
    });
    setBusyDay(day.date);
    setError(null);
    try {
      const { exportMany } = await import('../app/exportCarousel');
      await exportMany(items, 'png', (done, total) => setProgress(`${done}/${total}`), `fabrica-${day.date}`);
      for (const carousel of day.carousels) if (carousel.status === 'draft' || carousel.status === 'editing') await save(carousel, { status: 'ready' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyDay(null);
      setProgress(null);
    }
  };

  const markPosted = async (day: DayGroup) => {
    for (const carousel of day.carousels) if (!isPosted(carousel)) await save(carousel, { status: postedStatus(true) });
  };

  const renderDay = (day: DayGroup, tone: 'late' | 'normal') => {
    const pending = day.carousels.filter((carousel) => !isPosted(carousel)).length;
    return (
      <section key={day.date} aria-labelledby={`day-${day.date}`} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id={`day-${day.date}`} className={clsx('text-sm font-semibold capitalize', tone === 'late' ? 'text-red-700 dark:text-red-300' : 'text-ink')}>
              {day.date === today ? `Hoje · ${formatDay(day.date)}` : formatDay(day.date)}
            </h2>
            <p className="text-xs text-muted">
              {day.carousels.length} {day.carousels.length === 1 ? 'carrossel' : 'carrosséis'}
              {pending < day.carousels.length && ` · ${day.carousels.length - pending} postado${day.carousels.length - pending === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={busyDay === day.date} disabled={busyDay !== null} onClick={() => void downloadDay(day)}>
              {busyDay !== day.date && <Download className="size-4" aria-hidden />}
              {busyDay === day.date && progress ? `Gerando ${progress}` : 'Baixar o dia'}
            </Button>
            {pending > 0 && (
              <Button size="sm" variant="secondary" disabled={busyDay !== null} onClick={() => void markPosted(day)}>
                <CheckCheck className="size-4" aria-hidden /> Marcar o dia como postado
              </Button>
            )}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {day.carousels.map((carousel) => (
            <AgendaItem
              key={carousel.id}
              carousel={carousel}
              brand={brands.data.find((kit) => kit.id === carousel.brandKitId)}
              account={accounts.data.find((item) => item.id === carousel.source.accountId)}
              assets={assets.data}
              accounts={accounts.data}
              onReschedule={(date) => void save(carousel, { scheduledFor: date })}
              onPosted={(posted) => save(carousel, { status: postedStatus(posted) })}
            />
          ))}
        </ul>
      </section>
    );
  };

  const hasScheduled = groups.late.length + groups.upcoming.length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agenda"
        description="Os carrosséis programados, dia a dia. Baixe o dia, poste e marque cada um como postado."
        action={
          projects.length > 0 && (
            <Select aria-label="Filtrar por projeto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="!w-auto">
              <option value="">Todos os projetos</option>
              {projects.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )
        }
      />
      {created && <div className="mb-6"><Alert tone="success">{created} {created === 1 ? 'carrossel programado' : 'carrosséis programados'}.</Alert></div>}
      {(error ?? carousels.error) && <div className="mb-4"><Alert>{error ?? carousels.error}</Alert></div>}

      {!hasScheduled ? (
        <EmptyState
          title="Nada programado ainda"
          description='Na tela Criar, marque "Programar as postagens" e escolha a partir de que dia e quantos por dia.'
          action={<Link to="/criar" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Programar carrosséis</Link>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.late.length > 0 && <h2 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Atrasados</h2>}
          {groups.late.map((day) => renderDay(day, 'late'))}
          {groups.upcoming.length > 0 && groups.late.length > 0 && <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-faint">Próximos dias</h2>}
          {groups.upcoming.map((day) => renderDay(day, 'normal'))}
        </div>
      )}

      {groups.unscheduled.length > 0 && (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden />
          {groups.unscheduled.length} {groups.unscheduled.length === 1 ? 'carrossel sem data' : 'carrosséis sem data'}. Dá pra programar no editor de cada um ou em
          <Link to="/projetos" className="font-medium text-ink underline underline-offset-4">Projetos</Link>.
        </p>
      )}
    </div>
  );
}

interface AgendaItemProps {
  carousel: Carousel;
  brand: BrandKit | undefined;
  account: Account | undefined;
  assets: Asset[];
  accounts: Account[];
  onReschedule: (date: string | null) => void;
  onPosted: (posted: boolean) => Promise<void>;
}

function AgendaItem({ carousel, brand, account, assets, accounts, onReschedule, onPosted }: AgendaItemProps) {
  return (
    <li className="flex flex-col gap-2">
      <Link to={`/carrossel/${carousel.id}`} className="overflow-hidden rounded-xl ring-1 ring-line transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {brand && <CarouselCover carousel={carousel} brand={brand} assets={assets} accounts={accounts} scale={0.22} />}
      </Link>
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">{carousel.title}</p>
        <p className="truncate text-[11px] text-muted">{[account ? `@${account.handle}` : brand?.name, carousel.project, carousel.folder].filter(Boolean).join(' · ')}</p>
        {!isPosted(carousel) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge tone={carousel.status === 'ready' ? 'accent' : 'neutral'}>{STATUS_LABELS[carousel.status]}</Badge>
          </div>
        )}
        <PostedToggle carousel={carousel} onChange={onPosted} className="mt-2 w-full" />
        <label className="mt-2 block">
          <span className="sr-only">Mudar a data de {carousel.title}</span>
          <Input type="date" value={carousel.scheduledFor ?? ''} onChange={(e) => onReschedule(isIsoDate(e.target.value) ? e.target.value : null)} className="h-8 px-2 text-xs" />
        </label>
      </div>
    </li>
  );
}
