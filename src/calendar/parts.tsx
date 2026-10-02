import clsx from 'clsx';
import { AlertTriangle, FlaskConical, Sparkles } from 'lucide-react';
import { useState, type DragEvent, type FormEvent } from 'react';
import { accountLabel, type Account } from '../domain/account';
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  CALENDAR_STATUS_LABELS,
  CALENDAR_STATUSES,
  sanitizeEntryInput,
  type CalendarEntryInput,
  type CalendarItem,
  type CalendarStatus,
  type RepetitionAlert,
  type WeeklyPlan,
} from '../domain/calendar/calendar';
import { PLATFORM_LABELS, PLATFORMS } from '../domain/carousel';
import { CONTENT_CATEGORIES, CONTENT_CATEGORY_LABELS, OBJECTIVE_LABELS, OBJECTIVES } from '../domain/content';
import { TEST_VARIABLE_LABELS, type Experiment } from '../domain/experiments/experiment';
import { Button, Dialog, Field, Input, Select } from '../ui/primitives';

export const STATUS_STYLES: Record<CalendarStatus, { bar: string; dot: string; chip: string }> = {
  rascunho: { bar: 'border-l-faint', dot: 'bg-faint', chip: 'bg-subtle text-muted' },
  em_producao: { bar: 'border-l-amber-500', dot: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
  pronto: { bar: 'border-l-sky-500', dot: 'bg-sky-500', chip: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' },
  agendado: { bar: 'border-l-violet-500', dot: 'bg-violet-500', chip: 'bg-violet-500/15 text-violet-800 dark:text-violet-200' },
  publicado: { bar: 'border-l-emerald-500', dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' },
};

export const DRAG_TYPE = 'application/x-fabrica-calendar';

interface CardProps {
  item: CalendarItem;
  account: Account | undefined;
  compact?: boolean;
  onOpen: () => void;
}

/** One content on the calendar: drag it to another day, click to see everything. */
export function CalendarCard({ item, account, compact = false, onOpen }: CardProps) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, item.key);
    event.dataTransfer.effectAllowed = 'move';
  };
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      title={`${item.title} · ${CALENDAR_STATUS_LABELS[item.status]}`}
      className={clsx(
        'group w-full rounded-lg border border-line border-l-[3px] bg-surface text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        STATUS_STYLES[item.status].bar,
        compact ? 'px-2 py-1' : 'px-2.5 py-2',
      )}
    >
      {compact ? (
        <span className="line-clamp-1 text-[11px] font-medium text-ink">
          {item.time && <span className="mr-1 tabular-nums text-faint">{item.time}</span>}
          {item.title}
        </span>
      ) : (
        <>
          <span className="line-clamp-2 text-xs font-semibold leading-snug text-ink">“{item.title}”</span>
          <span className="mt-1 block truncate text-[11px] text-muted">{account ? accountLabel(account) : PLATFORM_LABELS[item.platform]}</span>
          <span className="mt-1 flex items-center gap-1 text-[10px] text-faint">
            {item.experimentId && <FlaskConical className="size-3 shrink-0 text-accent" aria-label="Conteúdo de teste" />}
            <span className="truncate">
              {item.time ? `${item.time} · ` : ''}
              {CALENDAR_KIND_LABELS[item.kind]} · {CONTENT_CATEGORY_LABELS[item.category]}
            </span>
          </span>
          <span className={clsx('mt-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_STYLES[item.status].chip)}>{CALENDAR_STATUS_LABELS[item.status]}</span>
        </>
      )}
    </button>
  );
}

export function PlanningPanel({ plan, tests, onGoal }: { plan: WeeklyPlan; tests: { label: string; count: number }[]; onGoal: (goal: number) => void }) {
  const [editing, setEditing] = useState(false);
  const rows: [string, number | string][] = [
    ['Planejados', plan.planned],
    ['Publicados', plan.published],
    ['Restantes', plan.remaining],
    ['Experimentos', plan.experiments],
    ['Contas ativas', plan.activeAccounts],
  ];
  return (
    <section aria-labelledby="plan-title" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="plan-title" className="text-sm font-semibold text-ink">
        Planejamento da semana
      </h2>
      <div className="mt-3 flex items-end justify-between gap-2">
        {editing ? (
          <Field label="Meta da semana" htmlFor="weekly-goal" className="w-28">
            <Input id="weekly-goal" type="number" min={1} max={500} defaultValue={plan.goal} autoFocus onBlur={(e) => (onGoal(Number(e.target.value)), setEditing(false))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Field>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="block text-[11px] text-muted">Meta (clique pra mudar)</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{plan.goal} conteúdos</span>
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (plan.published / Math.max(1, plan.goal)) * 100)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {plan.themes.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Temas da semana</p>
          <p className="mt-1 text-xs text-ink">{plan.themes.map((entry) => `${entry.theme}${entry.count > 1 ? ` (${entry.count})` : ''}`).join(' · ')}</p>
        </div>
      )}
      {tests.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Testes da semana</p>
          <ul className="mt-1 text-xs text-ink">
            {tests.map((test) => (
              <li key={test.label}>
                {test.count} {test.count === 1 ? 'teste' : 'testes'} de {test.label.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function DistributionPanel({ rows }: { rows: { label: string; count: number; share: number }[] }) {
  return (
    <section aria-labelledby="distribution-title" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="distribution-title" className="text-sm font-semibold text-ink">
        Distribuição de conteúdo
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-faint">Nada planejado nesse período.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-ink">{row.label}</span>
                <span className="tabular-nums text-muted">{Math.round(row.share * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <div className="h-full rounded-full bg-ink" style={{ width: `${row.share * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RepetitionPanel({ alerts, label }: { alerts: RepetitionAlert[]; label: (accountId: string | null) => string }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Alertas de repetição" className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div key={`${alert.accountId}-${alert.theme}-${alert.from}`} role="status" className="rounded-2xl border border-amber-300/70 bg-amber-50 p-3.5 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Atenção: você possui {alert.count} conteúdos consecutivos sobre {alert.theme.toLowerCase()} na conta {label(alert.accountId)}.
          </p>
          <p className="mt-1 pl-6 text-xs">
            {alert.suggestions.length ? `Talvez seja interessante alternar com ${alert.suggestions.map((theme) => theme.toLowerCase()).join(', ')}.` : 'Talvez seja interessante alternar com outro tema.'} É só um aviso: dá pra publicar assim.
          </p>
        </div>
      ))}
    </section>
  );
}

interface EntryDialogProps {
  initial: CalendarEntryInput;
  isNew: boolean;
  accounts: Account[];
  experiments: Experiment[];
  onClose: () => void;
  onSave: (input: CalendarEntryInput) => Promise<void>;
  /** Carousels only: open the create screen with everything filled in. */
  onGenerate: (input: CalendarEntryInput) => void;
}

/** "+ Novo conteúdo" on a day, or editing a planned one. */
export function EntryDialog({ initial, isNew, accounts, experiments, onClose, onSave, onGenerate }: EntryDialogProps) {
  const [draft, setDraft] = useState<CalendarEntryInput>(initial);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<CalendarEntryInput>) => setDraft((current) => ({ ...current, ...patch }));
  const accountExperiments = experiments.filter((experiment) => !experiment.concludedAt && (!draft.accountId || !experiment.accountId || experiment.accountId === draft.accountId));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await onSave(sanitizeEntryInput(draft));
    } finally {
      setPending(false);
    }
  };

  const formatDay = new Date(`${draft.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <Dialog
      title={isNew ? `Novo conteúdo · ${formatDay}` : 'Conteúdo planejado'}
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" type="submit" form="entry-form" loading={pending}>
            Salvar no calendário
          </Button>
          {draft.kind === 'carrossel' && (
            <Button variant="primary" onClick={() => onGenerate(sanitizeEntryInput(draft))}>
              <Sparkles className="size-4" aria-hidden /> Gerar conteúdo agora
            </Button>
          )}
        </>
      }
    >
      <form id="entry-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Ideia ou título" htmlFor="entry-title" className="sm:col-span-2">
          <Input id="entry-title" autoFocus value={draft.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} placeholder="Você não precisa de mais disciplina" />
        </Field>
        <Field label="Conta" htmlFor="entry-account">
          <Select
            id="entry-account"
            value={draft.accountId ?? ''}
            onChange={(e) => {
              const account = accounts.find((item) => item.id === e.target.value);
              set({ accountId: account?.id ?? null, platform: account?.platform ?? draft.platform });
            }}
          >
            <option value="">Sem conta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)} · {PLATFORM_LABELS[account.platform]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plataforma" htmlFor="entry-platform">
          <Select id="entry-platform" value={draft.platform} disabled={Boolean(draft.accountId)} onChange={(e) => set({ platform: e.target.value as CalendarEntryInput['platform'] })}>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo" htmlFor="entry-kind">
          <Select id="entry-kind" value={draft.kind} onChange={(e) => set({ kind: e.target.value as CalendarEntryInput['kind'] })}>
            {CALENDAR_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CALENDAR_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tema" htmlFor="entry-theme">
          <Input id="entry-theme" value={draft.theme} maxLength={60} onChange={(e) => set({ theme: e.target.value })} placeholder="disciplina" />
        </Field>
        <Field label="Categoria" htmlFor="entry-category">
          <Select id="entry-category" value={draft.category} onChange={(e) => set({ category: e.target.value as CalendarEntryInput['category'] })}>
            {CONTENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CONTENT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objetivo" htmlFor="entry-objective">
          <Select id="entry-objective" value={draft.objective ?? ''} onChange={(e) => set({ objective: (e.target.value || null) as CalendarEntryInput['objective'] })}>
            <option value="">Não definido</option>
            {OBJECTIVES.map((objective) => (
              <option key={objective} value={objective}>
                {OBJECTIVE_LABELS[objective]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data" htmlFor="entry-date">
          <Input id="entry-date" type="date" value={draft.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
        <Field label="Horário" htmlFor="entry-time">
          <Input id="entry-time" type="time" value={draft.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} />
        </Field>
        <Field label="Status" htmlFor="entry-status">
          <Select id="entry-status" value={draft.status} onChange={(e) => set({ status: e.target.value as CalendarStatus })}>
            {CALENDAR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CALENDAR_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Experimento" htmlFor="entry-experiment" hint="Marca como conteúdo de teste.">
          <Select id="entry-experiment" value={draft.experimentId ?? ''} onChange={(e) => set({ experimentId: e.target.value || null })}>
            <option value="">Não é teste</option>
            {accountExperiments.map((experiment) => (
              <option key={experiment.id} value={experiment.id}>
                {experiment.name} · {TEST_VARIABLE_LABELS[experiment.variable]}
              </option>
            ))}
          </Select>
        </Field>
        {draft.experimentId && (
          <Field label="Versão no teste" htmlFor="entry-variant" hint="Ex.: Controle, Variação, Gancho contrarian.">
            <Input id="entry-variant" value={draft.variant} maxLength={60} onChange={(e) => set({ variant: e.target.value })} placeholder="Variação" />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
