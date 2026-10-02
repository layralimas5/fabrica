import clsx from 'clsx';
import { AlertTriangle, FlaskConical, Repeat2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { useExperiments } from '../app/data';
import { useDismissedSimilarity, useSimilaritySettings } from '../app/planningSettings';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { Carousel } from '../domain/carousel';
import { emptyExperiment, variablesLabel } from '../domain/experiments/experiment';
import { todayIso } from '../domain/schedule';
import { comparableFromCarousel } from '../domain/similarity/fromContent';
import { ageLabel, findSimilar, MATCH_KIND_LABELS, SIMILARITY_BAND_LABELS, similarityBand } from '../domain/similarity/similarity';
import type { ContentRecord } from '../domain/winners/record';
import { ExperimentForm } from '../experiments/ExperimentForm';
import { Alert, Button, Field, Input, Select } from '../ui/primitives';

/** Detector de Similaridade on an open carousel: warns, links, never blocks. Each warning can be closed for good. */
export function SimilarityNotice({ carousel, carousels, records }: { carousel: Carousel; carousels: Carousel[]; records: ContentRecord[] }) {
  const { settings } = useSimilaritySettings();
  const { isDismissed, dismiss } = useDismissedSimilarity();
  const found = useMemo(() => {
    const winners = new Set(records.filter((record) => record.winner).map((record) => record.carouselId));
    const pool = carousels.filter((item) => item.id !== carousel.id && item.status !== 'archived' && item.source.accountId === carousel.source.accountId);
    return findSimilar(comparableFromCarousel(carousel, null, false), pool.map((item) => comparableFromCarousel(item, null, winners.has(item.id))), todayIso(), settings).slice(0, 2);
  }, [carousel, carousels, records, settings]);
  const matches = found.filter((match) => !isDismissed(carousel.id, match.other.id));
  if (matches.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => {
        const variation = match.kind === 'variacao';
        return (
          <div key={match.other.id} role="status" className={clsx('relative rounded-2xl p-4 pr-12 text-sm', variation ? 'bg-accent/10 text-ink' : 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100')}>
            <p className="flex items-start gap-2 font-medium">
              {variation ? <Repeat2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              {variation ? MATCH_KIND_LABELS.variacao : `Este conteúdo possui ${match.score}% de similaridade com outro conteúdo ${match.ageDays !== null && match.ageDays >= 0 ? `publicado ${ageLabel(match.ageDays)}` : `planejado ${ageLabel(match.ageDays)}`}.`}
            </p>
            <p className="mt-1 pl-6 text-xs">
              Similar a “{match.other.hook}” · {match.score}% · {SIMILARITY_BAND_LABELS[similarityBand(match.score)].toLowerCase()}.{' '}
              <Link to={`/carrossel/${match.other.id}`} className="font-medium underline underline-offset-2">
                Ver conteúdo
              </Link>
            </p>
            <button
              type="button"
              onClick={() => dismiss(carousel.id, match.other.id)}
              aria-label="Fechar aviso"
              title="Fechar aviso"
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** "Conteúdo de teste": which experiment this carousel belongs to and as which version. */
export function TestPanel({ carousel, onChange }: { carousel: Carousel; onChange: (experiment: Carousel['experiment']) => void }) {
  const services = useServices();
  const experiments = useExperiments();
  const scope = useAccountScope();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = carousel.experiment;
  const options = experiments.data.filter((experiment) => !experiment.concludedAt && (!experiment.accountId || experiment.accountId === carousel.source.accountId));
  const current = experiments.data.find((experiment) => experiment.id === ref?.id);

  const join = (experimentId: string, variant = ref?.variant || 'Variação') => {
    const experiment = experiments.data.find((item) => item.id === experimentId);
    if (experiment) onChange({ id: experiment.id, name: experiment.name, variant });
  };

  return (
    <section aria-labelledby="test-panel-title" className="rounded-2xl border border-line p-4">
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          checked={Boolean(ref)}
          onChange={(e) => {
            if (!e.target.checked) onChange(null);
            else if (options[0]) join(options[0].id);
            else setCreating(true);
          }}
        />
        <span>
          <span id="test-panel-title" className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="size-4 text-accent" aria-hidden /> Conteúdo de teste
          </span>
          <span className="block text-xs text-faint">Liga esse carrossel a um experimento pra comparar com as outras versões.</span>
        </span>
      </label>
      {ref && (
        <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field label="Experimento" htmlFor="test-experiment" hint={current ? `Testando: ${variablesLabel(current)}` : 'Teste de formato antigo'}>
            <div className="flex gap-2">
              <Select id="test-experiment" value={ref.id} onChange={(e) => join(e.target.value)}>
                {!current && <option value={ref.id}>{ref.name}</option>}
                {options.map((experiment) => (
                  <option key={experiment.id} value={experiment.id}>
                    {experiment.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => setCreating(true)}>
                Novo
              </Button>
            </div>
          </Field>
          <Field label="Versão no teste" htmlFor="test-variant" hint="Controle, Variação…">
            <Input id="test-variant" value={ref.variant} maxLength={60} onChange={(e) => onChange({ ...ref, variant: e.target.value })} />
          </Field>
          <Link to={`/testes/${ref.id}`} className="text-xs font-medium text-muted underline underline-offset-2 hover:text-ink sm:col-span-2">
            Ver o teste e os resultados
          </Link>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {creating && (
        <ExperimentForm
          initial={emptyExperiment(carousel.source.accountId ?? null)}
          isNew
          accounts={scope.active}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            try {
              const saved = await services.experiments.create(input);
              experiments.setData((list) => [saved, ...list]);
              onChange({ id: saved.id, name: saved.name, variant: ref?.variant || 'Variação' });
              setCreating(false);
            } catch (cause) {
              setError(errorMessage(cause));
            }
          }}
        />
      )}
    </section>
  );
}
