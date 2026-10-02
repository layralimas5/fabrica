import { FlaskConical } from 'lucide-react';
import { testsTime, versionsChosenPerCopy, versionsComeFromStyle, type TestBrief } from '../domain/experiments/brief';
import { EXPERIMENT_LIMITS, TEST_METRIC_LABELS, TEST_METRICS, TEST_VARIABLE_LABELS, TEST_VARIABLES, type TestMetric, type TestVariable } from '../domain/experiments/experiment';
import { VariableQuestionsFields } from '../experiments/VariableQuestionsFields';
import { Field, Input, Select, Textarea } from '../ui/primitives';
import { ChipGroup } from '../winners/chips';

/** One account per batch, so "Conta" is not something a single creation can test. */
const VARIABLES = TEST_VARIABLES.filter((variable) => variable !== 'conta');

interface TestBriefCardProps {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  brief: TestBrief;
  onChange: (patch: Partial<TestBrief>) => void;
  /** Selecting or removing what is tested; the page keeps "Testar formatos" in step with Design. */
  onVariables: (variables: TestVariable[]) => void;
  /** What still keeps the test from comparing anything. */
  problems: string[];
  disabled: boolean;
}

/** Ficha do teste: what the batch is testing (one or more things), why, how it is measured and when each version goes out. */
export function TestBriefCard({ enabled, onEnabled, brief, onChange, onVariables, problems, disabled }: TestBriefCardProps) {
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

          <ChipGroup label="O que estamos testando? (pode marcar mais de um)" options={VARIABLES} labelOf={(item) => TEST_VARIABLE_LABELS[item]} selected={brief.variables} onChange={onVariables} />

          <Field label="Hipótese" htmlFor="test-hypothesis">
            <Textarea id="test-hypothesis" rows={2} value={brief.hypothesis} maxLength={EXPERIMENT_LIMITS.hypothesis} onChange={(e) => onChange({ hypothesis: e.target.value })} placeholder="O que você espera que aconteça e por quê." disabled={disabled} />
          </Field>

          <VariableQuestionsFields
            idPrefix="test"
            variables={brief.variables}
            details={brief.details}
            times={brief.times}
            onDetails={(details) => onChange({ details })}
            onTimes={(times) => onChange({ times })}
            disabled={disabled}
          />

          {brief.variables.length > 0 && <p className="text-xs text-muted">{howVersionsWork(brief.variables)} Pra espalhar nos dias, use a programação do passo 5.</p>}
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

/** How each carousel gets its version, joining the parts of every selected variable. */
function howVersionsWork(variables: TestVariable[]): string {
  const parts = [
    versionsChosenPerCopy(variables) && 'você marca em cada copy se ela é Controle ou Variação',
    variables.some(versionsComeFromStyle) && 'cada modelo de slide é uma versão',
    testsTime(variables) && 'os carrosséis se revezam entre os horários',
  ].filter((part): part is string => Boolean(part));
  const sentence = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  const combined = parts.length > 1 ? ' A versão de cada carrossel junta as partes, por exemplo "Controle · 08:00".' : '';
  return `Como vira versão: ${sentence}.${combined}`;
}
