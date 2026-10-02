import clsx from 'clsx';
import { AlertTriangle, ExternalLink, Repeat2 } from 'lucide-react';
import type { Account } from '../domain/account';
import { accountLabel } from '../domain/account';
import type { Carousel } from '../domain/carousel';
import { hasNumberedSlides, parseScript, type ScriptCarousel } from '../domain/script';
import { comparableFromCarousel, comparableFromScript } from '../domain/similarity/fromContent';
import { ageLabel, ALERT_LEVEL_LABELS, findSimilar, MATCH_KIND_LABELS, type SimilarityMatch, type SimilaritySettings } from '../domain/similarity/similarity';
import { splitSentences } from '../domain/text';
import type { ContentRecord } from '../domain/winners/record';
import { Button, Dialog } from '../ui/primitives';

export interface CopyWarning {
  copyIndex: number;
  hook: string;
  match: SimilarityMatch;
}

interface CheckInput {
  copies: string[];
  manual: boolean;
  account: Account | null;
  carousels: Carousel[];
  records: ContentRecord[];
  theme: string;
  day: string | null;
  originId: string | null;
  today: string;
  settings: SimilaritySettings;
}

/** Each carousel about to be created against what the account already has. The closest match per carousel. */
export function checkCopies({ copies, manual, account, carousels, records, theme, day, originId, today, settings }: CheckInput): CopyWarning[] {
  if (!account) return [];
  const winners = new Set(records.filter((record) => record.winner).map((record) => record.carouselId));
  const pool = carousels.filter((carousel) => carousel.source.accountId === account.id && carousel.status !== 'archived').map((carousel) => comparableFromCarousel(carousel, null, winners.has(carousel.id)));
  const warnings: CopyWarning[] = [];
  copies.forEach((copy, copyIndex) => {
    if (!copy.trim()) return;
    const blocks: ScriptCarousel[] =
      manual || hasNumberedSlides(copy) ? parseScript(copy) : [{ title: '', slides: splitSentences(copy), caption: '', productIndex: null, objective: null, contentType: null }];
    blocks.forEach((block, blockIndex) => {
      if (block.slides.length === 0) return;
      const candidate = comparableFromScript(block, `nova-${copyIndex}-${blockIndex}`, account.id, theme, day, originId);
      const [match] = findSimilar(candidate, pool, today, settings);
      if (match) warnings.push({ copyIndex, hook: candidate.hook, match });
    });
  });
  return warnings;
}

interface SimilarityDialogProps {
  warnings: CopyWarning[];
  account: Account | null;
  onClose: () => void;
  onContinue: () => void;
  onNewVersion: (carouselId: string) => void;
}

/** Warns before creating; never blocks. Repeating a winning format on purpose is allowed. */
export function SimilarityDialog({ warnings, account, onClose, onContinue, onNewVersion }: SimilarityDialogProps) {
  return (
    <Dialog
      title="Detector de Similaridade"
      open
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar e editar
          </Button>
          <Button variant="primary" onClick={onContinue}>
            Continuar mesmo assim
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">É só um aviso: dá pra criar e publicar do mesmo jeito. Repetir um formato vencedor de propósito também é estratégia.</p>
        <ul className="flex flex-col gap-3">
          {warnings.map(({ copyIndex, hook, match }) => {
            const variation = match.kind === 'variacao';
            const when = match.ageDays !== null && match.ageDays >= 0 ? `publicado ${ageLabel(match.ageDays)}` : `planejado ${ageLabel(match.ageDays)}`;
            return (
              <li key={`${copyIndex}-${match.other.id}`} className={clsx('rounded-2xl border p-4', variation ? 'border-accent/30 bg-accent/5' : 'border-amber-300/70 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30')}>
                <p className="text-xs font-medium text-muted">
                  Copy {copyIndex + 1} · “{hook}”
                </p>
                <p className="mt-1 flex items-start gap-2 text-sm font-semibold text-ink">
                  {variation ? <Repeat2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />}
                  {variation ? MATCH_KIND_LABELS.variacao : `Este conteúdo possui ${match.score}% de similaridade com outro conteúdo ${when}.`}
                </p>
                <dl className="mt-2 grid gap-x-4 gap-y-1 pl-6 text-xs sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="inline text-faint">Similar a: </dt>
                    <dd className="inline text-ink">“{match.other.hook}”</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">Data: </dt>
                    <dd className="inline text-ink">{match.other.day ? new Date(`${match.other.day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'sem data'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">Conta: </dt>
                    <dd className="inline text-ink">{account ? accountLabel(account) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">Similarity: </dt>
                    <dd className="inline font-semibold text-ink">{match.score}%</dd>
                  </div>
                  <div>
                    <dt className="inline text-faint">Alerta: </dt>
                    <dd className="inline text-ink">{ALERT_LEVEL_LABELS[match.level]}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2 pl-6">
                  <a
                    href={`/carrossel/${match.other.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ExternalLink className="size-3.5" aria-hidden /> Ver conteúdo
                    <span className="sr-only">(abre em outra aba)</span>
                  </a>
                  <Button size="sm" variant="secondary" onClick={() => onNewVersion(match.other.id)}>
                    Criar nova versão
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
