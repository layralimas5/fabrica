import { Clock, Plus, X } from 'lucide-react';
import { testsTime, VARIABLE_QUESTIONS, versionsComeFromTime } from '../domain/experiments/brief';
import { EXPERIMENT_LIMITS, MAX_TEST_TIMES, TEST_VARIABLE_LABELS, type TestVariable, type VariableDetails, type VariableSides } from '../domain/experiments/experiment';
import { Button, Field, Input } from '../ui/primitives';

const DEFAULT_EXTRA_TIME = '12:00';

interface VariableQuestionsFieldsProps {
  /** Prefix for input ids, so two forms on a page never clash. */
  idPrefix: string;
  variables: TestVariable[];
  details: VariableDetails;
  times: string[];
  onDetails: (details: VariableDetails) => void;
  onTimes: (times: string[]) => void;
  disabled?: boolean;
}

/** One block of questions per selected variable: the times for Horário, control and variation for the rest. */
export function VariableQuestionsFields({ idPrefix, variables, details, times, onDetails, onTimes, disabled = false }: VariableQuestionsFieldsProps) {
  const setSides = (variable: TestVariable, patch: Partial<VariableSides>) =>
    onDetails({ ...details, [variable]: { ...(details[variable] ?? { control: '', variation: '' }), ...patch } });

  return (
    <div className="flex flex-col gap-3">
      {variables.map((variable) => {
        if (versionsComeFromTime(variable)) {
          return (
            <Section key={variable} title={TEST_VARIABLE_LABELS[variable]}>
              <TimeList idPrefix={idPrefix} times={times} onChange={onTimes} disabled={disabled} />
            </Section>
          );
        }
        const questions = VARIABLE_QUESTIONS[variable];
        if (!questions) return null;
        const sides = details[variable] ?? { control: '', variation: '' };
        return (
          <Section key={variable} title={TEST_VARIABLE_LABELS[variable]} note={questions.note}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={questions.control} htmlFor={`${idPrefix}-${variable}-control`}>
                <Input
                  id={`${idPrefix}-${variable}-control`}
                  value={sides.control}
                  maxLength={EXPERIMENT_LIMITS.version}
                  placeholder={questions.controlPlaceholder}
                  onChange={(e) => setSides(variable, { control: e.target.value })}
                  disabled={disabled}
                />
              </Field>
              <Field label={questions.variation} htmlFor={`${idPrefix}-${variable}-variation`}>
                <Input
                  id={`${idPrefix}-${variable}-variation`}
                  value={sides.variation}
                  maxLength={EXPERIMENT_LIMITS.version}
                  placeholder={questions.variationPlaceholder}
                  onChange={(e) => setSides(variable, { variation: e.target.value })}
                  disabled={disabled}
                />
              </Field>
            </div>
          </Section>
        );
      })}

      {!testsTime(variables) && (
        <Field label="Horário de postagem" htmlFor={`${idPrefix}-time`} hint="O mesmo pra todas as versões, pra o horário não interferir no resultado." className="sm:max-w-xs">
          <Input id={`${idPrefix}-time`} type="time" value={times[0] ?? ''} onChange={(e) => onTimes(e.target.value ? [e.target.value] : [])} disabled={disabled} />
        </Field>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-subtle/60 p-3 ring-1 ring-line">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
      {children}
      {note && <p className="mt-2 text-xs text-faint">{note}</p>}
    </section>
  );
}

function TimeList({ idPrefix, times, onChange, disabled }: { idPrefix: string; times: string[]; onChange: (times: string[]) => void; disabled: boolean }) {
  const update = (index: number, value: string) => onChange(times.map((time, position) => (position === index ? value : time)));
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <Clock className="size-3.5" aria-hidden /> Cada horário é uma versão. Os carrosséis se revezam entre eles.
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {times.map((time, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input id={`${idPrefix}-time-${index}`} type="time" aria-label={`Horário ${index + 1}`} value={time} onChange={(e) => update(index, e.target.value)} className="!w-32" disabled={disabled} />
            {times.length > 2 && (
              <Button size="sm" variant="ghost" aria-label={`Tirar o horário ${index + 1}`} onClick={() => onChange(times.filter((_, position) => position !== index))} disabled={disabled}>
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {times.length < MAX_TEST_TIMES && (
          <Button size="sm" variant="secondary" onClick={() => onChange([...times, DEFAULT_EXTRA_TIME])} disabled={disabled}>
            <Plus className="size-4" aria-hidden /> Horário
          </Button>
        )}
      </div>
    </fieldset>
  );
}
