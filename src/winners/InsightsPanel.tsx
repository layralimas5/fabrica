import { Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MIN_GROUP_SAMPLES, NOT_ENOUGH_DATA, type Insight } from '../domain/winners/insights';
import { MAX_WEIGHT, PRESET_WEIGHTS, SCORE_COMPONENT_LABELS, SCORE_COMPONENTS, SCORE_PROFILE_LABELS, SCORE_PROFILES, type ScoreProfile, type ScoreWeights } from '../domain/winners/score';
import { Button, Dialog } from '../ui/primitives';
import { Chip } from './chips';

interface InsightsPanelProps {
  insights: Insight[];
  /** Contents with at least one result: tells how far the user is from the first insight. */
  measured: number;
  limit?: number;
  showLink?: boolean;
}

export function InsightsPanel({ insights, measured, limit, showLink = false }: InsightsPanelProps) {
  const shown = limit ? insights.slice(0, limit) : insights;
  return (
    <section aria-labelledby="insights-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="insights-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Lightbulb className="size-4 text-amber-500" aria-hidden /> Insights
        </h2>
        {showLink && (
          <Link to="/analytics" className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Ver análise completa
          </Link>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {NOT_ENOUGH_DATA} Um insight só aparece quando cada lado da comparação tem pelo menos {MIN_GROUP_SAMPLES} conteúdos com resultado e a diferença passa de 25%.
          Hoje: {measured} {measured === 1 ? 'conteúdo medido' : 'conteúdos medidos'}.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((insight) => (
            <li key={insight.id} className="flex items-start justify-between gap-3 rounded-xl bg-subtle px-3.5 py-2.5">
              <p className="text-sm text-ink">{insight.text}</p>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-faint" title="Conteúdos no grupo · conteúdos comparados">
                {insight.samples} vs {insight.compared}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ScoreSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  profile: ScoreProfile;
  weights: ScoreWeights;
  onProfile: (profile: ScoreProfile) => void;
  onCustom: (weights: ScoreWeights) => void;
}

/** Choose what "good" means: awareness weighs reach, conversion weighs sign-ups and sales. */
export function ScoreSettingsDialog({ open, onClose, profile, weights, onProfile, onCustom }: ScoreSettingsDialogProps) {
  const [draft, setDraft] = useState<ScoreWeights>(weights);
  const [draftProfile, setDraftProfile] = useState<ScoreProfile>(profile);

  const pick = (next: ScoreProfile) => {
    setDraftProfile(next);
    if (next !== 'personalizado') setDraft(PRESET_WEIGHTS[next]);
  };

  const save = () => {
    if (draftProfile === 'personalizado') onCustom(draft);
    else onProfile(draftProfile);
    onClose();
  };

  return (
    <Dialog
      title="Content Score"
      open={open}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">
          Nota de 0 a 100 que compara cada conteúdo com a média da própria conta: 50 é o normal da conta, 75 é o dobro, 100 é quatro vezes ou mais. Usa taxas, não números absolutos, então conta pequena não perde pra conta grande.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Perfil de pesos">
          {SCORE_PROFILES.map((item) => (
            <Chip key={item} active={draftProfile === item} onClick={() => pick(item)}>
              {SCORE_PROFILE_LABELS[item]}
            </Chip>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCORE_COMPONENTS.map((key) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-xs text-muted">
                {SCORE_COMPONENT_LABELS[key]}
                <span className="tabular-nums text-ink">{draft[key].toLocaleString('pt-BR')}</span>
              </span>
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={0.25}
                value={draft[key]}
                onChange={(e) => {
                  setDraft((current) => ({ ...current, [key]: Number(e.target.value) }));
                  setDraftProfile('personalizado');
                }}
                className="accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
