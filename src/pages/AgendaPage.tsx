import clsx from 'clsx';
import { CalendarDays, CheckCheck, Download, MousePointerClick } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { renderContextFor } from '../app/renderContextFor';
import { useAccounts, useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import { brandForCarousel, type BrandKit } from '../domain/brandKit';
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
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const created = (useLocation().state as { created?: number } | null)?.created;
  const today = todayIso();

  const projects = useMemo(() => [...new Set(carousels.data.map((carousel) => carousel.project).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [carousels.data]);
  const visible = useMemo(() => carousels.data.filter((carousel) => !projectFilter || carousel.project === projectFilter), [carousels.data, projectFilter]);
  const groups = useMemo(() => groupByDay(visible, today), [visible, today]);
  /** Nothing shows until a day is picked; the day stays in the address so going back keeps it. */
  const [params, setParams] = useSearchParams();
  const days = useMemo(() => [...groups.late.map((day) => ({ day, late: true })), ...groups.upcoming.map((day) => ({ day, late: false }))], [groups]);
  const selected = days.find(({ day }) => day.date === params.get('dia')) ?? null;
  const selectDay = (date: string | null) => setParams(date ? { dia: date } : {}, { replace: true });

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
    // Creation order, so the folders in the ZIP follow the order they were planned.
    const ordered = [...day.carousels].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const items = ordered.flatMap((carousel) => {
      const brand = brandForCarousel(carousel, brands.data, accounts.data);
      return brand ? [{ carousel, context: renderContextFor(carousel, brand, assets.data, services.assets, accounts.data) }] : [];
    });
    const missing = ordered.filter((carousel) => !items.some((item) => item.carousel.id === carousel.id));
    setBusyDay(day.date);
    setError(null);
    setDownloaded(null);
    try {
      const { exportMany } = await import('../app/exportCarousel');
      await exportMany(items, 'png', (done, total) => setProgress(`${done}/${total}`), `fabrica-${day.date}`);
      setDownloaded(`${formatDay(day.date)}: ${items.length} ${items.length === 1 ? 'carrossel baixado' : 'carrosséis baixados'} no ZIP.`);
      if (missing.length) setError(`Ficaram de fora porque não há nenhum Brand Kit cadastrado: ${missing.map((carousel) => carousel.title).join(', ')}.`);
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
        <div className="flex flex-col gap-6">
          {byProject(day.carousels).map(({ project, carousels: items }, _, all) => (
            <div key={project || '__none__'}>
              {all.length > 1 && (
                <h3 className="mb-3 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {project || 'Sem projeto'}
                  <span className="font-normal normal-case tracking-normal text-faint">
                    {items.length} {items.length === 1 ? 'carrossel' : 'carrosséis'}
                  </span>
                </h3>
              )}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {items.map((carousel) => (
                  <AgendaItem
                    key={carousel.id}
                    carousel={carousel}
                    brand={brandForCarousel(carousel, brands.data, accounts.data) ?? undefined}
                    account={accounts.data.find((item) => item.id === carousel.source.accountId)}
                    assets={assets.data}
                    accounts={accounts.data}
                    onReschedule={(date) => void save(carousel, { scheduledFor: date })}
                    onPosted={(posted) => save(carousel, { status: postedStatus(posted) })}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
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
      {downloaded && <div className="mb-4"><Alert tone="success">{downloaded}</Alert></div>}
      {(error ?? carousels.error) && <div className="mb-4"><Alert>{error ?? carousels.error}</Alert></div>}

      {!hasScheduled ? (
        <EmptyState
          title="Nada programado ainda"
          description='Na tela Criar, marque "Programar as postagens" e escolha a partir de que dia e quantos por dia.'
          action={<Link to="/criar" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Programar carrosséis</Link>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DayPicker days={days} today={today} selected={selected?.day.date ?? null} onSelect={selectDay} />
          {selected ? (
            renderDay(selected.day, selected.late ? 'late' : 'normal')
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <MousePointerClick className="size-5 text-faint" aria-hidden />
              <p className="mt-2 text-sm font-medium text-ink">Escolha um dia</p>
              <p className="mt-1 text-sm text-muted">Os carrosséis do dia aparecem aqui, separados por projeto.</p>
            </div>
          )}
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

/** The day's carousels split by project, projects in alphabetical order and unfiled ones last. */
function byProject(carousels: Carousel[]): { project: string; carousels: Carousel[] }[] {
  const groups = new Map<string, Carousel[]>();
  for (const carousel of carousels) groups.set(carousel.project, [...(groups.get(carousel.project) ?? []), carousel]);
  return [...groups.entries()]
    .map(([project, items]) => ({ project, carousels: [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1) || a.project.localeCompare(b.project));
}

interface DayPickerProps {
  days: { day: DayGroup; late: boolean }[];
  today: string;
  selected: string | null;
  onSelect: (date: string | null) => void;
}

/** One button per scheduled day: late ones first in red, then today onward. Clicking the open day closes it. */
function DayPicker({ days, today, selected, onSelect }: DayPickerProps) {
  return (
    <div role="group" aria-label="Dias com carrosséis" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {days.map(({ day, late }) => {
        const active = day.date === selected;
        const posted = day.carousels.filter(isPosted).length;
        const done = posted === day.carousels.length;
        const [weekday, date] = formatDay(day.date).split(', ');
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : day.date)}
            className={clsx(
              'flex min-w-[5.5rem] shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
              active ? 'border-ink bg-ink text-canvas' : late ? 'border-red-300 bg-surface text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40' : 'border-line bg-surface text-ink hover:bg-subtle',
            )}
          >
            <span className={clsx('text-[11px] font-medium uppercase tracking-wide', active ? 'text-canvas/70' : 'opacity-70')}>
              {day.date === today ? 'Hoje' : late ? 'Atrasado' : weekday.replace('.', '')}
            </span>
            <span className="text-sm font-semibold tabular-nums">{date ?? weekday}</span>
            <span className={clsx('text-[11px] tabular-nums', active ? 'text-canvas/70' : 'text-muted')}>
              {done ? '✓ tudo postado' : `${day.carousels.length} ${day.carousels.length === 1 ? 'carrossel' : 'carrosséis'}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
