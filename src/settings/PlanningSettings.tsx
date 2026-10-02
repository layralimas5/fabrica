import { useState } from 'react';
import { useSimilaritySettings, useWeeklyGoal } from '../app/planningSettings';
import { DEFAULT_SIMILARITY_SETTINGS, type SimilaritySettings } from '../domain/similarity/similarity';
import { Alert, Button, Field, Input } from '../ui/primitives';

const DAY_FIELDS: { key: Exclude<keyof SimilaritySettings, 'threshold'>; label: string; hint: string }[] = [
  { key: 'highDays', label: 'Alerta alto até', hint: 'dias desde o conteúdo parecido' },
  { key: 'mediumDays', label: 'Alerta médio até', hint: 'dias' },
  { key: 'lowDays', label: 'Alerta baixo até', hint: 'dias; também é a idade mínima pra reciclar' },
  { key: 'recyclableDays', label: 'Reciclável a partir de', hint: 'dias; aí deixa de ser repetição' },
];

/** Detector windows and the weekly goal of the calendar. Saved in this browser. */
export function PlanningSettings() {
  const { settings, setSettings } = useSimilaritySettings();
  const { goal, setGoal } = useWeeklyGoal();
  const [draft, setDraft] = useState(settings);
  const [goalDraft, setGoalDraft] = useState(String(goal));
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSettings(draft);
    setGoal(Number(goalDraft));
    setSaved(true);
  };

  return (
    <section aria-labelledby="planning-settings" className="mt-8 rounded-2xl border border-line bg-surface p-5">
      <h2 id="planning-settings" className="text-sm font-semibold text-ink">
        Detector de Similaridade e planejamento
      </h2>
      <p className="mt-1 text-xs text-muted">O detector só avisa, nunca bloqueia. Quanto mais recente o conteúdo parecido, mais forte o aviso.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={`Avisar a partir de ${draft.threshold}% de similaridade`} htmlFor="sim-threshold" className="sm:col-span-2">
          <input
            id="sim-threshold"
            type="range"
            min={20}
            max={95}
            step={5}
            value={draft.threshold}
            onChange={(e) => (setDraft({ ...draft, threshold: Number(e.target.value) }), setSaved(false))}
            className="accent-[var(--accent)]"
          />
        </Field>
        {DAY_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`sim-${field.key}`} hint={field.hint}>
            <Input id={`sim-${field.key}`} type="number" min={1} max={730} value={draft[field.key]} onChange={(e) => (setDraft({ ...draft, [field.key]: Number(e.target.value) }), setSaved(false))} />
          </Field>
        ))}
        <Field label="Meta de conteúdos por semana" htmlFor="weekly-goal-setting" hint="Aparece no Planejamento da semana do Calendário.">
          <Input id="weekly-goal-setting" type="number" min={1} max={500} value={goalDraft} onChange={(e) => (setGoalDraft(e.target.value), setSaved(false))} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {saved && <Alert tone="success">Salvo neste navegador.</Alert>}
        <Button variant="ghost" onClick={() => (setDraft(DEFAULT_SIMILARITY_SETTINGS), setSaved(false))}>
          Voltar ao padrão
        </Button>
        <Button variant="primary" onClick={save}>
          Salvar
        </Button>
      </div>
    </section>
  );
}
