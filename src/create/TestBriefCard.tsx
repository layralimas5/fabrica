import { Clock, FlaskConical, Plus, X } from 'lucide-react';
import { switchVariable, versionsComeFromStyle, versionsComeFromTime, type TestBrief } from '../domain/experiments/brief';
import { EXPERIMENT_LIMITS, MAX_TEST_TIMES, TEST_METRIC_LABELS, TEST_METRICS, TEST_VARIABLE_LABELS, TEST_VARIABLES, type TestMetric, type TestVariable } from '../domain/experiments/experiment';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives';
import { ChipGroup } from '../winners/chips';

/** One account per batch, so "Conta" is not something a single creation can test. */
const VARIABLES = TEST_VARIABLES.filter((variable) => variable !== 'conta');
const DEFAULT_EXTRA_TIME = '12:00';

interface TestBriefCardProps {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  brief: TestBrief;
  onChange: (patch: Partial<TestBrief>) => void;
  /** "Testar formatos" is on: the test is about the slide model. */
  formatTest: boolean;
  /** What still keeps the test from comparing anything. */
  problems: string[];
  disabled: boolean;
}

/** Ficha do teste: what the batch is testing, why, how it is measured and when each version is posted. */
export function TestBriefCard({ enabled, onEnabled, brief, onChange, formatTest, problems, disabled }: TestBriefCardProps) {
  const byTime = versionsComeFromTime(brief.variable);
  return (
    <div className="rounded-2xl border border-line p-4">
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} disabled={disabled} />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="size-4 text-accent" aria-hidden /> Isso é um teste
          </span>
          <span className="block text-xs text-faint">Abre a ficha do teste. Os carrosséis entram juntos na aba Testes, com versão, horário e resultado.</span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4 flex flex-col gap-4 pl-6">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Nome do teste" htmlFor="test-name">
              <Input id="test-name" value={brief.name} maxLength={EXPERIMENT_LIMITS.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Teste de Horário #01" disabled={disabled} />
            </Field>
            <Field label="Métrica que decide" htmlFor="test-metric">
              <Select id="test-metric" value={brief.goalMetric} onChange={(e) => onChange({ goalMetric: e.target.value as TestMetric })} disabled={disabled}>
                {TEST_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {TEST_METRIC_LABELS[metric]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {formatTest ? (
            <p className="text-sm text-ink">
              Testando: <span className="font-medium">{TEST_VARIABLE_LABELS.design}</span> <span className="text-xs text-faint">(os modelos marcados em "Testar formatos" são as versões)</span>
            </p>
          ) : (
            <ChipGroup label="O que estamos testando?" options={VARIABLES} labelOf={(item) => TEST_VARIABLE_LABELS[item]} selected={[brief.variable]} onChange={(next) => next[0] && onChange(switchVariable(brief, next[0]))} single />
          )}

          <Field label="Hipótese" htmlFor="test-hypothesis">
            <Textarea id="test-hypothesis" rows={2} value={brief.hypothesis} maxLength={EXPERIMENT_LIMITS.hypothesis} onChange={(e) => onChange({ hypothesis: e.target.value })} placeholder="O que você espera que aconteça e por quê." disabled={disabled} />
          </Field>

          {byTime ? (
            <TimeList times={brief.times} onChange={(times) => onChange({ times })} disabled={disabled} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
              <Field label="Controle (como é hoje)" htmlFor="test-control">
                <Input id="test-control" value={brief.control} maxLength={EXPERIMENT_LIMITS.version} onChange={(e) => onChange({ control: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Variação (o que muda)" htmlFor="test-variation">
                <Input id="test-variation" value={brief.variation} maxLength={EXPERIMENT_LIMITS.version} onChange={(e) => onChange({ variation: e.target.value })} disabled={disabled} />
              </Field>
              <Field label="Horário de postagem" htmlFor="test-time" hint="O mesmo pra todas as versões.">
                <Input id="test-time" type="time" value={brief.times[0] ?? ''} onChange={(e) => onChange({ times: e.target.value ? [e.target.value] : [] })} disabled={disabled} />
              </Field>
            </div>
          )}

          <p className="text-xs text-muted">{howVersionsWork(brief.variable, formatTest)} Pra espalhar nos dias, use a programação do passo 5.</p>
          {problems.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs font-medium text-amber-700 dark:text-amber-300" aria-live="polite">
              {problems.map((problem) => (
                <li key={problem}>• {problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TimeList({ times, onChange, disabled }: { times: string[]; onChange: (times: string[]) => void; disabled: boolean }) {
  const update = (index: number, value: string) => onChange(times.map((time, position) => (position === index ? value : time)));
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Clock className="size-3.5" aria-hidden /> Horários (cada um é uma versão)
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {times.map((time, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input type="time" aria-label={`Horário ${index + 1}`} value={time} onChange={(e) => update(index, e.target.value)} className="!w-32" disabled={disabled} />
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

function howVersionsWork(variable: TestVariable, formatTest: boolean): string {
  if (formatTest || variable === 'design') return 'Cada copy sai em cada modelo marcado, com o mesmo texto e as mesmas fotos.';
  if (versionsComeFromTime(variable)) return 'Os carrosséis se revezam entre os horários: o 1º no primeiro horário, o 2º no segundo, e assim por diante.';
  if (versionsComeFromStyle(variable)) return 'A versão de cada carrossel é o modelo de slide que ele usou.';
  return 'Marque em cada copy se ela é o Controle ou a Variação.';
}
