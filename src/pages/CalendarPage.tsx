import clsx from 'clsx';
import { AlertTriangle, CheckCheck, ChevronLeft, ChevronRight, Download, ExternalLink, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { useAssets, useBrandKits, useCalendarEntries, useCarousels, useContentRecords, useExperiments } from '../app/data';
import { useSimilaritySettings, useWeeklyGoal } from '../app/planningSettings';
import { renderContextFor } from '../app/renderContextFor';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { planFromEntry } from '../application/calendarPlan';
import { CalendarCard, DistributionPanel, DRAG_TYPE, EntryDialog, PlanningPanel, RepetitionPanel, STATUS_STYLES } from '../calendar/parts';
import { accountLabel } from '../domain/account';
import { brandForCarousel } from '../domain/brandKit';
import {
  addDays,
  addMonths,
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  CALENDAR_STATUS_LABELS,
  CALENDAR_STATUSES,
  calendarItems,
  distribution,
  emptyEntry,
  EMPTY_CALENDAR_FILTERS,
  filterCalendar,
  monthGrid,
  repetitionAlerts,
  toEntryInput,
  weekDays,
  weeklyPlan,
  type CalendarEntry,
  type CalendarEntryInput,
  type CalendarFilters,
  type CalendarItem,
  type CalendarStatus,
} from '../domain/calendar/calendar';
import { PLATFORM_LABELS, PLATFORMS, STATUS_LABELS, toCarouselInput, type Carousel, type CarouselStatus } from '../domain/carousel';
import { CONTENT_CATEGORIES, CONTENT_CATEGORY_LABELS } from '../domain/content';
import { allExperiments, TEST_VARIABLE_LABELS, variablesLabel, variablesOf, type Experiment } from '../domain/experiments/experiment';
import { todayIso } from '../domain/schedule';
import { comparableFromCarousel } from '../domain/similarity/fromContent';
import { ageLabel, findSimilar, MATCH_KIND_LABELS, type SimilarityMatch } from '../domain/similarity/similarity';
import { carouselPerformance } from '../domain/winners/family';
import { emptyRecordInput, formatMetric, PERFORMANCE_LABELS, type ContentRecordInput, type PerformanceKey } from '../domain/winners/record';
import { Drawer } from '../ui/Drawer';
import { Alert, Button, Field, Input, PageHeader, Select, Spinner } from '../ui/primitives';
import { useAddMetrics } from '../winners/useAddMetrics';
import { WinnerFormDialog } from '../winners/WinnerFormDialog';

const VIEWS = ['dia', 'semana', 'mes'] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };
const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_VISIBLE = 3;

/** Calendar status → stored carousel status. "Agendado" is a ready carousel with a time. */
const CAROUSEL_STATUS_FOR: Record<CalendarStatus, CarouselStatus> = { rascunho: 'draft', em_producao: 'editing', pronto: 'ready', agendado: 'ready', publicado: 'published' };
const DEFAULT_TIME = '09:00';

export function CalendarPage() {
  const services = useServices();
  const navigate = useNavigate();
  const scope = useAccountScope();
  const carousels = useCarousels();
  const entries = useCalendarEntries();
  const records = useContentRecords();
  const experimentsData = useExperiments();
  const brands = useBrandKits();
  const assets = useAssets();
  const { goal, setGoal } = useWeeklyGoal();
  const { settings: similarity } = useSimilaritySettings();
  const metrics = useAddMetrics((saved) => records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]));
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.find((item) => item === params.get('visao')) ?? 'semana';
  const today = todayIso();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') ?? '') ? (params.get('data') as string) : today;
  const [filters, setFilters] = useState(EMPTY_CALENDAR_FILTERS);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ input: CalendarEntryInput; id: string | null } | null>(null);
  const [registering, setRegistering] = useState<CalendarEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountOf = (accountId: string | null) => scope.accounts.find((account) => account.id === accountId);
  const experiments = useMemo(() => allExperiments(experimentsData.data, carousels.data), [experimentsData.data, carousels.data]);
  const items = useMemo(
    () => calendarItems(carousels.data, entries.data, records.data, (accountId) => scope.accounts.find((account) => account.id === accountId)?.platform ?? null),
    [carousels.data, entries.data, records.data, scope.accounts],
  );
  const full: CalendarFilters = { ...filters, accountId: scope.current?.id ?? null };
  const filtered = useMemo(() => filterCalendar(items, full), [items, full.accountId, full.platform, full.status, full.kind, full.category]); // eslint-disable-line react-hooks/exhaustive-deps

  const week = weekDays(anchor);
  const month = monthGrid(anchor);
  const range = view === 'dia' ? [anchor] : view === 'semana' ? week : month.flat().filter((day) => day.slice(0, 7) === anchor.slice(0, 7));
  const inRange = filtered.filter((item) => item.date >= range[0] && item.date <= range[range.length - 1]);
  const inWeek = filtered.filter((item) => item.date >= week[0] && item.date <= week[6]);
  const byDay = (day: string) => filtered.filter((item) => item.date === day);

  if (carousels.loading || entries.loading || records.loading || scope.loading) return <Spinner label="Montando o calendário" />;

  const go = (next: { visao?: View; data?: string }) => setParams({ visao: next.visao ?? view, data: next.data ?? anchor }, { replace: true });
  const shift = (direction: 1 | -1) => go({ data: view === 'mes' ? addMonths(anchor, direction) : addDays(anchor, view === 'semana' ? 7 * direction : direction) });
  const label = (accountId: string | null) => {
    const account = accountOf(accountId);
    return account ? accountLabel(account) : 'Sem conta';
  };

  const saveCarousel = async (carousel: Carousel, patch: Partial<Carousel>) => {
    const saved = await services.carousels.update(carousel.id, toCarouselInput({ ...carousel, ...patch }));
    carousels.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    return saved;
  };
  const saveEntry = async (id: string, input: CalendarEntryInput) => {
    const saved = await services.calendarEntries.update(id, input);
    entries.setData((current) => current.map((item) => (item.id === saved.id ? saved : item)));
  };
  const attempt = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const move = (key: string, date: string) => {
    const item = items.find((entry) => entry.key === key);
    if (!item || item.date === date) return;
    void attempt(async () => {
      if (item.carousel) await saveCarousel(item.carousel, { scheduledFor: date });
      else if (item.entry) await saveEntry(item.entry.id, { ...toEntryInput(item.entry), date });
    });
  };

  const newEntry = (date: string) => setEditing({ id: null, input: { ...emptyEntry(date, scope.current?.id ?? null, scope.current?.platform ?? 'instagram'), status: 'rascunho' } });

  const storeEntry = async (input: CalendarEntryInput) => {
    await attempt(async () => {
      if (editing?.id) await saveEntry(editing.id, input);
      else {
        const saved = await services.calendarEntries.create(input);
        entries.setData((current) => [...current, saved]);
      }
      setEditing(null);
    });
  };

  const generate = (input: CalendarEntryInput) => navigate('/criar', { state: { plan: planFromEntry(input, editing?.id ?? null) } });

  const downloadDay = async (day: string) => {
    const list = byDay(day).flatMap((item) => (item.carousel ? [item.carousel] : [])).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const exportable = list.flatMap((carousel) => {
      const brand = brandForCarousel(carousel, brands.data, scope.accounts);
      return brand ? [{ carousel, context: renderContextFor(carousel, brand, assets.data, services.assets, scope.accounts) }] : [];
    });
    setBusy(`download:${day}`);
    await attempt(async () => {
      const { exportMany } = await import('../app/exportCarousel');
      await exportMany(exportable, 'png', () => undefined, `fabrica-${day}`);
      setNotice(`${exportable.length} ${exportable.length === 1 ? 'carrossel baixado' : 'carrosséis baixados'} no ZIP.`);
      for (const carousel of list) if (carousel.status === 'draft' || carousel.status === 'editing') await saveCarousel(carousel, { status: 'ready' });
    });
    setBusy(null);
  };

  const markDayPosted = async (day: string) => {
    setBusy(`posted:${day}`);
    await attempt(async () => {
      for (const item of byDay(day)) {
        if (item.status === 'publicado') continue;
        if (item.carousel) await saveCarousel(item.carousel, { status: 'published' });
        else if (item.entry) await saveEntry(item.entry.id, { ...toEntryInput(item.entry), status: 'publicado' });
      }
    });
    setBusy(null);
  };

  const plan = weeklyPlan(inWeek, goal, scope.active.filter((account) => !scope.current || account.id === scope.current.id).length);
  const weekTests = (() => {
    const ids = new Set(inWeek.map((item) => item.experimentId).filter(Boolean));
    const byVariable = new Map<string, number>();
    for (const experiment of experiments) {
      if (!ids.has(experiment.id)) continue;
      for (const variable of variablesOf(experiment)) byVariable.set(TEST_VARIABLE_LABELS[variable], (byVariable.get(TEST_VARIABLE_LABELS[variable]) ?? 0) + 1);
    }
    return [...byVariable.entries()].map(([testLabel, count]) => ({ label: testLabel, count }));
  })();
  const alerts = repetitionAlerts(inRange);
  const open = items.find((item) => item.key === openKey) ?? null;
  const unscheduled = carousels.data.filter((carousel) => !carousel.scheduledFor && carousel.status !== 'archived' && scope.matches(carousel.source.accountId)).length;
  const title =
    view === 'mes'
      ? new Date(`${anchor}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : view === 'semana'
        ? `${formatShort(week[0])} a ${formatShort(week[6])}`
        : new Date(`${anchor}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const dropProps = (day: string) => ({
    onDragOver: (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE) && (event.preventDefault(), (event.dataTransfer.dropEffect = 'move')),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      move(event.dataTransfer.getData(DRAG_TYPE), day);
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Calendário"
        description="Tudo que foi publicado, agendado e planejado, de todas as contas. Arraste um card pra mudar o dia."
        action={
          <Button variant="primary" onClick={() => newEntry(view === 'dia' ? anchor : today)}>
            <Plus className="size-4" aria-hidden /> Novo conteúdo
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => go({ data: today })}>
            Hoje
          </Button>
          <Button variant="secondary" size="sm" aria-label="Próximo" onClick={() => shift(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <h2 className="ml-1 text-base font-semibold capitalize tracking-tight text-ink">{title}</h2>
        </div>
        <div role="tablist" aria-label="Visualização" className="flex gap-1 rounded-xl bg-subtle p-1">
          {VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => go({ visao: item })}
              className={clsx('rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', view === item ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink')}
            >
              {VIEW_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <FilterSelect id="cal-account" label="Conta" value={scope.current?.id ?? ''} onChange={(value) => scope.setCurrent(value || null)}>
          <option value="">Todas</option>
          {scope.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountLabel(account)} · {PLATFORM_LABELS[account.platform]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="cal-platform" label="Plataforma" value={filters.platform} onChange={(value) => setFilters((current) => ({ ...current, platform: value as typeof filters.platform }))}>
          <option value="all">Todas</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PLATFORM_LABELS[platform]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="cal-status" label="Status" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value as typeof filters.status }))}>
          <option value="all">Todos</option>
          {CALENDAR_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CALENDAR_STATUS_LABELS[status]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="cal-kind" label="Tipo" value={filters.kind} onChange={(value) => setFilters((current) => ({ ...current, kind: value as typeof filters.kind }))}>
          <option value="all">Todos</option>
          {CALENDAR_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CALENDAR_KIND_LABELS[kind]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="cal-category" label="Categoria" value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value as typeof filters.category }))}>
          <option value="all">Todas</option>
          {CONTENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CONTENT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </FilterSelect>
      </div>

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {(error ?? carousels.error ?? entries.error) && (
        <div className="mb-4">
          <Alert>{error ?? carousels.error ?? entries.error}</Alert>
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <RepetitionPanel alerts={alerts} label={label} />

          {view === 'semana' && (
            <div className="grid gap-2 lg:grid-cols-7">
              {week.map((day, index) => (
                <section key={day} aria-label={formatLong(day)} {...dropProps(day)} className={clsx('flex min-h-40 flex-col rounded-2xl border bg-surface/60 p-2', day === today ? 'border-ink/30' : 'border-line')}>
                  <div className="mb-2 flex items-center justify-between gap-1 px-1">
                    <button type="button" onClick={() => go({ visao: 'dia', data: day })} className={clsx('rounded text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', day === today ? 'font-semibold text-ink' : 'text-muted hover:text-ink')}>
                      {WEEKDAY_SHORT[index]} <span className="tabular-nums">{day.slice(8)}</span>
                    </button>
                    <button type="button" aria-label={`Novo conteúdo em ${formatLong(day)}`} onClick={() => newEntry(day)} className="grid size-6 place-items-center rounded-md text-faint hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {byDay(day).map((item) => (
                      <li key={item.key}>
                        <CalendarCard item={item} account={accountOf(item.accountId)} onOpen={() => setOpenKey(item.key)} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {view === 'mes' && (
            <div className="relative overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-7 gap-1">
                {WEEKDAY_SHORT.map((weekday) => (
                  <p key={weekday} className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
                    {weekday}
                  </p>
                ))}
                {month.flat().map((day) => {
                  const list = byDay(day);
                  const outside = day.slice(0, 7) !== anchor.slice(0, 7);
                  return (
                    <section key={day} aria-label={formatLong(day)} {...dropProps(day)} className={clsx('flex min-h-28 flex-col gap-1 rounded-xl border p-1.5', outside ? 'border-transparent bg-subtle/40' : 'border-line bg-surface', day === today && 'ring-1 ring-ink/30')}>
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => go({ visao: 'dia', data: day })} className={clsx('rounded px-1 text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', day === today ? 'font-semibold text-ink' : outside ? 'text-faint' : 'text-muted')}>
                          {Number(day.slice(8))}
                        </button>
                        <button type="button" aria-label={`Novo conteúdo em ${formatLong(day)}`} onClick={() => newEntry(day)} className="grid size-5 place-items-center rounded text-faint hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          <Plus className="size-3" aria-hidden />
                        </button>
                      </div>
                      {list.slice(0, MONTH_VISIBLE).map((item) => (
                        <CalendarCard key={item.key} item={item} account={accountOf(item.accountId)} compact onOpen={() => setOpenKey(item.key)} />
                      ))}
                      {list.length > MONTH_VISIBLE && (
                        <button type="button" onClick={() => go({ visao: 'dia', data: day })} className="rounded px-1 text-left text-[11px] font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          + {list.length - MONTH_VISIBLE} mais
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'dia' && (
            <section aria-label={formatLong(anchor)} {...dropProps(anchor)} className="rounded-2xl border border-line bg-surface p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  {byDay(anchor).length} {byDay(anchor).length === 1 ? 'conteúdo' : 'conteúdos'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => newEntry(anchor)}>
                    <Plus className="size-4" aria-hidden /> Novo conteúdo
                  </Button>
                  {byDay(anchor).some((item) => item.carousel) && (
                    <Button size="sm" variant="primary" loading={busy === `download:${anchor}`} disabled={busy !== null} onClick={() => void downloadDay(anchor)}>
                      <Download className="size-4" aria-hidden /> Baixar o dia
                    </Button>
                  )}
                  {byDay(anchor).some((item) => item.status !== 'publicado') && (
                    <Button size="sm" variant="secondary" loading={busy === `posted:${anchor}`} disabled={busy !== null} onClick={() => void markDayPosted(anchor)}>
                      <CheckCheck className="size-4" aria-hidden /> Marcar o dia como postado
                    </Button>
                  )}
                </div>
              </div>
              {byDay(anchor).length === 0 ? (
                <p className="py-10 text-center text-sm text-faint">Nada nesse dia. Use “Novo conteúdo” ou arraste um card pra cá.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byDay(anchor).map((item) => (
                    <li key={item.key}>
                      <CalendarCard item={item} account={accountOf(item.accountId)} onOpen={() => setOpenKey(item.key)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {unscheduled > 0 && (
            <p className="text-xs text-muted">
              {unscheduled} {unscheduled === 1 ? 'carrossel sem data' : 'carrosséis sem data'} não aparecem aqui. Dá pra dar uma data no editor de cada um ou em{' '}
              <Link to="/projetos" className="font-medium text-ink underline underline-offset-4">
                Projetos
              </Link>
              .
            </p>
          )}
        </div>

        <aside className="grid gap-4 md:grid-cols-2 2xl:flex 2xl:flex-col">
          <PlanningPanel plan={plan} tests={weekTests} onGoal={setGoal} />
          <DistributionPanel rows={distribution(inRange)} />
          <div className="flex flex-wrap gap-2 text-[11px] text-muted">
            {CALENDAR_STATUSES.map((status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <span className={clsx('size-2 rounded-full', STATUS_STYLES[status].dot)} aria-hidden />
                {CALENDAR_STATUS_LABELS[status]}
              </span>
            ))}
          </div>
        </aside>
      </div>

      {open && (
        <ItemDrawer
          item={open}
          accountName={label(open.accountId)}
          experimentName={experiments.find((experiment) => experiment.id === open.experimentId)}
          similar={open.carousel ? topMatch(open.carousel, carousels.data, records.data, today, similarity) : null}
          record={open.carousel ? (records.data.find((record) => record.carouselId === open.carousel?.id) ?? null) : (records.data.find((record) => record.id === open.entry?.recordId) ?? null)}
          onClose={() => setOpenKey(null)}
          onCarousel={(patch) => open.carousel && void attempt(() => saveCarousel(open.carousel as Carousel, patch))}
          onEntry={(patch) => open.entry && void attempt(() => saveEntry((open.entry as CalendarEntry).id, { ...toEntryInput(open.entry as CalendarEntry), ...patch }))}
          onEditEntry={() => open.entry && (setEditing({ id: open.entry.id, input: toEntryInput(open.entry) }), setOpenKey(null))}
          onDeleteEntry={() =>
            open.entry &&
            window.confirm('Excluir esse conteúdo planejado?') &&
            void attempt(async () => {
              await services.calendarEntries.remove((open.entry as CalendarEntry).id);
              entries.setData((current) => current.filter((item) => item.id !== open.entry?.id));
              setOpenKey(null);
            })
          }
          onGenerate={() => open.entry && navigate('/criar', { state: { plan: planFromEntry(toEntryInput(open.entry), open.entry.id) } })}
          onMetrics={() => open.carousel && metrics.open(open.carousel)}
          onRegister={() => open.entry && (setRegistering(open.entry), setOpenKey(null))}
        />
      )}

      {editing && (
        <EntryDialog
          initial={editing.input}
          isNew={!editing.id}
          accounts={scope.active}
          experiments={experiments}
          onClose={() => setEditing(null)}
          onSave={storeEntry}
          onGenerate={generate}
        />
      )}

      {registering && (
        <WinnerFormDialog
          open
          title="Resultados do conteúdo"
          onClose={() => setRegistering(null)}
          initial={registerInput(registering)}
          recordId={registering.recordId}
          accounts={scope.accounts}
          library={records.data}
          onSaved={(saved) => {
            records.setData((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            void attempt(() => saveEntry(registering.id, { ...toEntryInput(registering), recordId: saved.id, status: 'publicado' }));
            setRegistering(null);
          }}
        />
      )}
      {metrics.dialog}
    </div>
  );
}

function formatShort(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatLong(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function FilterSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </Field>
  );
}

const KIND_FORMAT: Record<CalendarEntry['kind'], ContentRecordInput['format']> = { carrossel: 'carrossel', video: 'video_narrado', ugc: 'ugc', reels: 'video_narrado', outros: 'outros' };

/** Results of a planned video/UGC/Reels start from what the calendar already knows about it. */
function registerInput(entry: CalendarEntry): ContentRecordInput {
  return {
    ...emptyRecordInput(),
    winner: false,
    title: entry.title,
    hook: entry.title,
    theme: entry.theme,
    accountId: entry.accountId,
    platform: entry.platform,
    format: KIND_FORMAT[entry.kind],
    publishedAt: entry.date,
    objective: entry.objective,
  };
}

/** The closest content of the same account, for the panel. */
function topMatch(carousel: Carousel, carousels: Carousel[], records: { carouselId: string | null; winner: boolean }[], today: string, settings: ReturnType<typeof useSimilaritySettings>['settings']): SimilarityMatch | null {
  const winners = new Set(records.filter((record) => record.winner && record.carouselId).map((record) => record.carouselId));
  const pool = carousels.filter((item) => item.id !== carousel.id && item.source.accountId === carousel.source.accountId && item.status !== 'archived');
  const candidate = comparableFromCarousel(carousel, null, false);
  return findSimilar(candidate, pool.map((item) => comparableFromCarousel(item, null, winners.has(item.id))), today, settings)[0] ?? null;
}

interface ItemDrawerProps {
  item: CalendarItem;
  accountName: string;
  experimentName: Pick<Experiment, 'id' | 'name' | 'variable' | 'variables'> | undefined;
  similar: SimilarityMatch | null;
  record: { metrics: Record<PerformanceKey, number | null> } | null;
  onClose: () => void;
  onCarousel: (patch: Partial<Carousel>) => void;
  onEntry: (patch: Partial<CalendarEntryInput>) => void;
  onEditEntry: () => void;
  onDeleteEntry: () => void;
  onGenerate: () => void;
  onMetrics: () => void;
  onRegister: () => void;
}

const DRAWER_METRICS: PerformanceKey[] = ['views', 'likes', 'shares', 'saves', 'comments', 'follows'];

/** Everything about one content of the calendar, editable where it makes sense. */
function ItemDrawer({ item, accountName, experimentName, similar, record, onClose, onCarousel, onEntry, onEditEntry, onDeleteEntry, onGenerate, onMetrics, onRegister }: ItemDrawerProps) {
  const carousel = item.carousel;
  const metrics = record?.metrics ?? (carousel ? carouselPerformance(carousel.metrics) : null);
  const changeStatus = (status: CalendarStatus) => {
    if (!carousel) return onEntry({ status });
    const time = status === 'agendado' ? (carousel.source.scheduledTime ?? DEFAULT_TIME) : status === 'pronto' ? null : carousel.source.scheduledTime;
    onCarousel({ status: CAROUSEL_STATUS_FOR[status], source: { ...carousel.source, scheduledTime: time } });
  };

  return (
    <Drawer
      title={carousel?.title || item.title}
      open
      onClose={onClose}
      footer={
        carousel ? (
          <Link to={`/carrossel/${carousel.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-medium text-canvas hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <ExternalLink className="size-4" aria-hidden /> Abrir conteúdo completo
          </Link>
        ) : (
          <>
            <Button variant="danger" className="mr-auto" onClick={onDeleteEntry}>
              <Trash2 className="size-4" aria-hidden /> Excluir
            </Button>
            <Button variant="secondary" onClick={onEditEntry}>
              Editar
            </Button>
            {item.kind === 'carrossel' && (
              <Button variant="primary" onClick={onGenerate}>
                Gerar conteúdo agora
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Gancho</p>
          <p className="mt-1 text-pretty text-base font-semibold leading-snug text-ink">“{item.title}”</p>
        </div>

        {similar && (
          <div role="status" className={clsx('rounded-xl p-3 text-sm', similar.kind === 'variacao' ? 'bg-accent/10 text-ink' : 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100')}>
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {similar.score}% parecido com outro conteúdo {similar.ageDays !== null && similar.ageDays >= 0 ? `publicado ${ageLabel(similar.ageDays)}` : `planejado ${ageLabel(similar.ageDays)}`}.
            </p>
            <p className="mt-1 pl-6 text-xs">
              {MATCH_KIND_LABELS[similar.kind]}: “{similar.other.hook}”.{' '}
              <Link to={`/carrossel/${similar.other.id}`} className="font-medium underline underline-offset-2">
                Ver conteúdo
              </Link>
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Info label="Conta">{accountName}</Info>
          <Info label="Plataforma">{PLATFORM_LABELS[item.platform]}</Info>
          <Info label="Tipo">{CALENDAR_KIND_LABELS[item.kind]}</Info>
          <Info label="Tema">{item.theme || '—'}</Info>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" htmlFor="drawer-date">
            <Input id="drawer-date" type="date" value={item.date} onChange={(e) => e.target.value && (carousel ? onCarousel({ scheduledFor: e.target.value }) : onEntry({ date: e.target.value }))} />
          </Field>
          <Field label="Horário" htmlFor="drawer-time">
            <Input
              id="drawer-time"
              type="time"
              value={item.time ?? ''}
              onChange={(e) => (carousel ? onCarousel({ source: { ...carousel.source, scheduledTime: e.target.value || null } }) : onEntry({ time: e.target.value || null }))}
            />
          </Field>
          <Field label="Status" htmlFor="drawer-status">
            <Select id="drawer-status" value={item.status} onChange={(e) => changeStatus(e.target.value as CalendarStatus)}>
              {CALENDAR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CALENDAR_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor="drawer-category">
            <Select id="drawer-category" value={item.category} onChange={(e) => (carousel ? onCarousel({ source: { ...carousel.source, category: e.target.value as CalendarItem['category'] } }) : onEntry({ category: e.target.value as CalendarItem['category'] }))}>
              {CONTENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CONTENT_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {carousel && ['analyzing', 'winner', 'weak'].includes(carousel.status) && <p className="-mt-3 text-xs text-faint">Classificação: {STATUS_LABELS[carousel.status]}.</p>}

        {experimentName && (
          <div className="flex items-center gap-2 rounded-xl bg-subtle px-3 py-2.5 text-sm">
            <FlaskConical className="size-4 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {experimentName.name} · {variablesLabel(experimentName)}
              {carousel?.experiment?.variant ? ` · ${carousel.experiment.variant}` : item.entry?.variant ? ` · ${item.entry.variant}` : ''}
            </span>
            <Link to={`/testes/${experimentName.id}`} className="text-xs font-medium text-ink underline underline-offset-2">
              Ver teste
            </Link>
          </div>
        )}

        {item.status === 'publicado' && (
          <section aria-label="Métricas">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Métricas</p>
              <Button size="sm" variant="ghost" onClick={carousel ? onMetrics : onRegister}>
                {metrics ? 'Atualizar' : 'Adicionar métricas'}
              </Button>
            </div>
            {metrics ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {DRAWER_METRICS.filter((key) => metrics[key] !== null).map((key) => (
                  <Info key={key} label={PERFORMANCE_LABELS[key]}>
                    <span className="tabular-nums">{formatMetric(key, metrics[key] ?? 0)}</span>
                  </Info>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-faint">Ainda sem números.</p>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-ink">{children}</dd>
    </div>
  );
}
