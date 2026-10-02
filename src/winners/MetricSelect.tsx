import { ANALYSIS_METRIC_GROUPS, analysisMetricLabel, type AnalysisMetric } from '../domain/winners/insights';
import { Select } from '../ui/primitives';

/** Attention, interest and conversion metrics are grouped apart so they are never read as one "best". */
export function MetricSelect({ value, onChange, id }: { value: AnalysisMetric; onChange: (metric: AnalysisMetric) => void; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-muted">
        Comparar por
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as AnalysisMetric)} className="!w-auto">
        {ANALYSIS_METRIC_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option} value={option}>
                {analysisMetricLabel(option)}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}
