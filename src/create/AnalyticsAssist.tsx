import clsx from 'clsx';
import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { isMeasured } from '../domain/analytics/items';
import { EXPLORATION_INFO, EXPLORATION_LEVELS, hasRecommendations, recommend, templateLabel, type ExplorationLevel, type Recommendations } from '../domain/analytics/intelligence';
import { CONTENT_TYPE_LABELS } from '../domain/content';
import { NOT_ENOUGH_DATA } from '../domain/winners/insights';
import { useWinnerLibrary } from '../winners/useWinnerLibrary';

/** What the Analytics of an account recommends; all accounts when none is given. */
export function useRecommendations(accountId: string | null): { recommendations: Recommendations; loading: boolean } {
  const library = useWinnerLibrary();
  const recommendations = useMemo(() => {
    const ofAccount = library.items.filter((item) => !accountId || item.record.accountId === accountId);
    return recommend(ofAccount.filter(isMeasured).map((item) => item.record), ofAccount.map((item) => item.record), library.scoreValue);
  }, [library.items, library.scoreValue, accountId]);
  return { recommendations, loading: library.loading };
}

interface AnalyticsAssistProps {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  level: ExplorationLevel;
  onLevel: (level: ExplorationLevel) => void;
  recommendations: Recommendations;
  accountName: string | null;
  disabled: boolean;
}

/** "Usar dados do Analytics": scale what works without stopping new tests. */
export function AnalyticsAssist({ enabled, onEnabled, level, onLevel, recommendations, accountName, disabled }: AnalyticsAssistProps) {
  const known = hasRecommendations(recommendations);
  const facts = [
    recommendations.template && `Template ${templateLabel(recommendations.template.value)} (score ${recommendations.template.score}, ${recommendations.template.samples} conteúdos)`,
    recommendations.contentType && `Tipo ${CONTENT_TYPE_LABELS[recommendations.contentType.value].toLowerCase()} (score ${recommendations.contentType.score})`,
    recommendations.slideCount && `${recommendations.slideCount.value} slides (score ${recommendations.slideCount.score})`,
    recommendations.hooks.length > 0 && `Ganchos: ${recommendations.hooks.map((hook) => hook.label.toLowerCase()).join(', ')}`,
    recommendations.themes.length > 0 && `Temas: ${recommendations.themes.map((theme) => theme.label).join(', ')}`,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="rounded-2xl border border-line p-4">
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} disabled={disabled} />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <BarChart3 className="size-4 text-accent" aria-hidden /> Usar dados do Analytics
          </span>
          <span className="block text-xs text-faint">
            Aplica nas copys o que performa acima da média {accountName ? `da conta ${accountName}` : 'das suas contas'}, sem parar de testar coisas novas.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4 flex flex-col gap-3 pl-6">
          <div role="radiogroup" aria-label="Nível de exploração" className="grid gap-1 rounded-2xl bg-subtle p-1 sm:grid-cols-3">
            {EXPLORATION_LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={level === item}
                disabled={disabled}
                onClick={() => onLevel(item)}
                className={clsx(
                  'rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  level === item ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface/60',
                )}
              >
                <span className="block text-sm font-medium text-ink">{EXPLORATION_INFO[item].label}</span>
                <span className="block text-[11px] leading-snug text-muted">{EXPLORATION_INFO[item].detail}</span>
              </button>
            ))}
          </div>
          {known ? (
            <ul className="flex flex-col gap-1 text-xs text-muted">
              {facts.map((fact) => (
                <li key={fact}>✓ {fact}</li>
              ))}
              {level !== 'safe' && recommendations.untestedTemplates.length > 0 && (
                <li className="text-faint">Pra testar: {recommendations.untestedTemplates.map(templateLabel).join(', ')}</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              {NOT_ENOUGH_DATA} Por enquanto, as copys seguem o que você escolheu{level !== 'safe' ? ', e as de teste usam templates e tipos pouco usados' : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
