import clsx from 'clsx';
import { ClipboardCopy, Download, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage } from '../app/useResource';
import { DISTRIBUTION_STATUS_LABELS, DISTRIBUTION_STATUSES, type DistributionStatus, type FacebookGroup, type GroupDistribution, type GroupDistributionInput } from '../domain/groups/groups';
import { formatDay, todayIso } from '../domain/schedule';
import { resultsByLink, type TrackingEvent, type TrackingLink } from '../domain/tracking/tracking';
import { copyText } from '../tracking/useTracking';
import { Alert, Button, Input, Textarea } from '../ui/primitives';

interface Props {
  groups: FacebookGroup[];
  distributions: GroupDistribution[];
  links: TrackingLink[];
  events: TrackingEvent[];
  onSave: (distribution: GroupDistribution, patch: Partial<GroupDistributionInput>) => Promise<void>;
  onDownload: (carouselId: string) => Promise<void>;
}

/** The divulgation calendar as a checklist: what to post where and when, and what came back, typed by hand. */
export function ChecklistTab({ groups, distributions, links, events, onSave, onDownload }: Props) {
  const [showDone, setShowDone] = useState(false);
  const today = todayIso();
  const visible = distributions
    .filter((item) => showDone || item.status === 'pending')
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const byDay = useMemo(() => {
    const days = new Map<string, GroupDistribution[]>();
    for (const item of visible) days.set(item.date ?? '', [...(days.get(item.date ?? '') ?? []), item]);
    return [...days.entries()];
  }, [visible]);
  const clicksByLink = useMemo(() => new Map(resultsByLink(events, links, 'last').map((result) => [result.link.id, result.counts])), [events, links]);
  const pending = distributions.filter((item) => item.status === 'pending').length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {pending} {pending === 1 ? 'publicação pendente' : 'publicações pendentes'}. As métricas dos grupos não vêm de API: reações e comentários são anotados à mão; cliques e cadastros vêm do link de cada grupo.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Mostrar publicadas e não autorizadas
        </label>
      </div>
      {byDay.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">Nada na checklist. Gera versões na aba Divulgar.</p>
      ) : (
        byDay.map(([day, items]) => (
          <section key={day || 'sem-dia'} aria-label={day ? formatDay(day) : 'Sem dia'}>
            <h3 className={clsx('mb-2 text-xs font-semibold uppercase tracking-wider', day && day < today && items.some((item) => item.status === 'pending') ? 'text-amber-700 dark:text-amber-300' : 'text-faint')}>
              {day ? formatDay(day) : 'Sem dia'}
              {day === today && ' · hoje'}
              {day && day < today && items.some((item) => item.status === 'pending') && ' · atrasado'}
            </h3>
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id}>
                  <DistributionCard item={item} group={groups.find((group) => group.id === item.groupId)} counts={item.linkId ? (clicksByLink.get(item.linkId) ?? null) : null} onSave={onSave} onDownload={onDownload} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

interface CardProps {
  item: GroupDistribution;
  group: FacebookGroup | undefined;
  counts: Record<string, number> | null;
  onSave: Props['onSave'];
  onDownload: Props['onDownload'];
}

function DistributionCard({ item, group, counts, onSave, onDownload }: CardProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ postUrl: item.postUrl, reactions: item.results.reactions, comments: item.results.comments, notes: item.notes });
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, label: string) => {
    setFeedback((await copyText(value)) ? `${label} copiado.` : 'O navegador bloqueou a cópia.');
    setTimeout(() => setFeedback(null), 2000);
  };

  const setStatus = (status: DistributionStatus) => run(`status:${status}`, () => onSave(item, { status, publishedAt: status === 'published' ? (item.publishedAt ?? new Date().toISOString()) : item.publishedAt }));

  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{group?.name ?? 'Grupo removido'}</p>
          <p className="text-xs text-muted">{item.title}</p>
        </div>
        <div role="radiogroup" aria-label={`Status em ${group?.name ?? 'grupo'}`} className="flex gap-1 rounded-xl bg-subtle p-1">
          {DISTRIBUTION_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={item.status === status}
              disabled={busy !== null}
              onClick={() => void setStatus(status)}
              className={clsx('h-7 rounded-lg px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', item.status === status ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
            >
              {DISTRIBUTION_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-muted">{item.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => void copy(item.text, 'Texto')}>
          <ClipboardCopy className="size-3.5" aria-hidden /> Copiar publicação
        </Button>
        {item.comment && (
          <Button variant="secondary" size="sm" onClick={() => void copy(item.comment, 'Comentário')}>
            <ClipboardCopy className="size-3.5" aria-hidden /> Copiar comentário do link
          </Button>
        )}
        {group?.url && (
          <a href={group.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Abrir grupo <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {item.carouselId && (
          <Button variant="secondary" size="sm" loading={busy === 'download'} onClick={() => void run('download', () => onDownload(item.carouselId as string))}>
            <Download className="size-3.5" aria-hidden /> Baixar imagens
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Fechar resultados' : 'Resultados'}
        </Button>
      </div>
      {feedback && (
        <p role="status" className="mt-2 text-xs text-muted">
          {feedback}
        </p>
      )}
      {counts && (
        <p className="mt-2 text-xs text-faint">
          Pelo link deste grupo: {counts.click} cliques · {counts.lp_view} visitas · {counts.signup} cadastros
        </p>
      )}
      {open && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-3">
            Link do post no grupo
            <Input value={draft.postUrl} onChange={(e) => setDraft({ ...draft, postUrl: e.target.value })} placeholder="https://www.facebook.com/groups/.../posts/..." />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Reações
            <Input type="number" min={0} value={draft.reactions ?? ''} onChange={(e) => setDraft({ ...draft, reactions: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Comentários
            <Input type="number" min={0} value={draft.comments ?? ''} onChange={(e) => setDraft({ ...draft, comments: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-3">
            O que comentaram, resposta dos admins
            <Textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
          <div className="sm:col-span-3">
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'results'}
              onClick={() => void run('results', () => onSave(item, { postUrl: draft.postUrl, results: { reactions: draft.reactions, comments: draft.comments }, notes: draft.notes }))}
            >
              Salvar resultados
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </article>
  );
}
