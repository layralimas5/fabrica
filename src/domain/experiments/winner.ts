import type { AccountDefaults } from '../account';
import { normalizeTime } from '../carousel';
import { VISUAL_STYLE_LABELS, VISUAL_STYLES, type VisualStyle } from '../brandKit';
import { variablesOf, CONFIDENCE_LABELS, TEST_METRIC_LABELS, TEST_VARIABLE_LABELS, type Confidence, type Experiment } from './experiment';
import { VARIABLE_QUESTIONS, type VersionDimension } from './brief';

/** The leader of one part of the test (Gancho + CTA, Modelo, Horário), read on its own. */
export interface DimensionLeader {
  dimension: VersionDimension;
  leader: string;
  runnerUp: string | null;
  confidence: Confidence | null;
}

export interface WinnerPlan {
  /** Account defaults the winner changes; empty when the test was about the copy only. */
  defaults: Partial<AccountDefaults>;
  /** Sentence saved as the test's learning, which the Analytics suggestions already read. */
  learning: string;
  /** One line per change, shown before applying and kept on the test. */
  changes: string[];
}

const styleByLabel = (label: string): VisualStyle | null => VISUAL_STYLES.find((style) => VISUAL_STYLE_LABELS[style] === label) ?? null;

/** What "Aplicar o vencedor" does: winning time and model become account defaults; copy winners become a learning. */
export function winnerPlan(experiment: Experiment, leaders: DimensionLeader[]): WinnerPlan {
  const defaults: Partial<AccountDefaults> = {};
  const changes: string[] = [];
  const lessons: string[] = [];
  const metric = TEST_METRIC_LABELS[experiment.goalMetric].toLowerCase();

  for (const { dimension, leader, runnerUp, confidence } of leaders) {
    const against = runnerUp ? ` (contra ${runnerUp})` : '';
    const sure = confidence ? `, ${CONFIDENCE_LABELS[confidence].toLowerCase()}` : '';
    if (dimension.kind === 'time') {
      const time = normalizeTime(leader);
      if (!time) continue;
      defaults.postingTime = time;
      changes.push(`Horário padrão da conta: ${time}`);
      lessons.push(`Horário: ${time} teve mais ${metric}${against}${sure}.`);
    } else if (dimension.kind === 'style') {
      const style = styleByLabel(leader);
      if (style) {
        defaults.visualStyle = style;
        changes.push(`Modelo de slide padrão da conta: ${leader}`);
      }
      lessons.push(`Modelo: ${leader} teve mais ${metric}${against}${sure}.`);
    } else if (leader !== 'Controle' && leader !== 'Variação') {
      // Older tests named their versions freely ("Contrarian"): the name itself is the lesson.
      lessons.push(`${dimension.label}: ${leader} teve mais ${metric}${against}${sure}.`);
      changes.push(`Aprendizado nas sugestões do Analytics: ${leader}`);
    } else {
      const side = leader === 'Controle' ? 'control' : 'variation';
      for (const variable of variablesOf(experiment)) {
        const questions = VARIABLE_QUESTIONS[variable];
        if (!questions || variable === 'design' || variable === 'template') continue;
        const winning = experiment.details?.[variable]?.[side]?.trim();
        const losing = experiment.details?.[variable]?.[side === 'control' ? 'variation' : 'control']?.trim();
        const name = TEST_VARIABLE_LABELS[variable];
        lessons.push(winning ? `${name}: "${winning}" teve mais ${metric}${losing ? ` que "${losing}"` : ''}${sure}.` : `${name}: a ${leader} teve mais ${metric}${sure}.`);
      }
      changes.push(`Aprendizado nas sugestões do Analytics: ${leader} de ${dimension.label}`);
    }
  }
  if (changes.length > 0 && (defaults.postingTime || defaults.visualStyle)) defaults.source = experiment.name;
  return { defaults, learning: lessons.join(' '), changes };
}
