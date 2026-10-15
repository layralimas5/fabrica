import { analysisSchema, type Analysis } from '../aiContract';

/** A reading of the measured results of a project, kept so the analyses of past weeks can be compared. */
export interface AiInsight {
  id: string;
  projectId: string | null;
  projectName: string;
  from: string;
  to: string;
  analysis: Analysis;
  createdAt: string;
  updatedAt: string;
}

export type AiInsightInput = Omit<AiInsight, 'id' | 'createdAt' | 'updatedAt'>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeInsightInput(raw: Partial<AiInsightInput>): AiInsightInput {
  const parsed = analysisSchema.safeParse(raw.analysis);
  return {
    projectId: typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null,
    projectName: typeof raw.projectName === 'string' ? raw.projectName.slice(0, 60) : '',
    from: typeof raw.from === 'string' && DAY.test(raw.from) ? raw.from : '',
    to: typeof raw.to === 'string' && DAY.test(raw.to) ? raw.to : '',
    analysis: parsed.success ? parsed.data : { summary: '', observations: [], suggestions: [] },
  };
}
