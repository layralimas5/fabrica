/**
 * Rules for the office agent (Jason) that works through the studio key. It may ask for videos and put ready videos
 * in the publishing queue, but every post it creates stays "awaiting_approval": only the owner approves, in the app.
 * Mirrors the app rules in src/domain/studio/videoJob.ts (kept equal by agent.test.ts).
 */

export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
export type Format = 'long' | 'vertical';
export type Privacy = 'public' | 'unlisted' | 'private';

/** Channels the studio writes from a briefing (Lumo only renders a ready composition, so it stays with the owner). */
export const AGENT_CHANNELS = ['nivora', 'ohlayralm', 'omnxdepp'] as const;
const DRAFT_LEAD_MINUTES = 10;
const MIN_LEAD_MINUTES = 5;
const MAX_TITLE = 120;
const MAX_BRIEF = 4000;

const MAX_SECONDS: Record<Platform, Record<Format, number>> = {
  instagram: { long: 0, vertical: 15 * 60 },
  tiktok: { long: 0, vertical: 10 * 60 },
  facebook: { long: 4 * 60 * 60, vertical: 4 * 60 * 60 },
  youtube: { long: 12 * 60 * 60, vertical: 3 * 60 },
};
export const MAX_TEXT: Record<Platform, number> = { instagram: 2200, facebook: 5000, tiktok: 2200, youtube: 5000 };

export interface AgentVideoFile {
  path?: string | null;
  durationSec: number;
}

export interface AgentPostInput {
  videoJobId: string;
  connectionId: string;
  format: Format;
  title: string;
  caption: string;
  privacy: Privacy;
  postAt: Date;
}

export interface AgentPostContext {
  job: { status: string; outputs: Partial<Record<Format, AgentVideoFile>> };
  connection: { platform: Platform; status: string };
}

export const formatsFor = (platform: Platform): Format[] => (platform === 'youtube' || platform === 'facebook' ? ['long', 'vertical'] : ['vertical']);
const sendsToDrafts = (platform: Platform) => platform === 'tiktok';

export function agentPostProblems({ job, connection }: AgentPostContext, input: AgentPostInput, now: Date): string[] {
  const problems: string[] = [];
  if (job.status !== 'ready') problems.push('O vídeo ainda não está pronto.');
  if (connection.status !== 'connected') problems.push('A conta não está conectada.');
  if (!formatsFor(connection.platform).includes(input.format)) problems.push('Essa rede só recebe o vídeo vertical.');
  const file = job.outputs[input.format];
  if (!file) problems.push(`Esse pedido não tem o vídeo ${input.format === 'long' ? 'longo' : 'vertical'}.`);
  else {
    if (input.format === 'long' && connection.platform !== 'youtube' && !file.path) problems.push('O longo só existe no PC: ele vai só para o YouTube.');
    const limit = MAX_SECONDS[connection.platform][input.format];
    if (file.durationSec > limit) problems.push(`O vídeo tem ${Math.round(file.durationSec)} s e essa rede aceita até ${limit} s nesse formato.`);
  }
  if (connection.platform === 'youtube' && !input.title.trim()) problems.push('O YouTube precisa de título.');
  if (connection.platform === 'youtube' && /[<>]/.test(input.title + input.caption)) problems.push('O YouTube não aceita < nem > no título e na descrição.');
  if (input.caption.length > MAX_TEXT[connection.platform]) problems.push(`O texto passa de ${MAX_TEXT[connection.platform]} caracteres.`);
  if (input.postAt.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) problems.push('Escolhe um horário pelo menos 5 minutos à frente.');
  return problems;
}

/** The row the agent inserts. Always awaiting_approval; TikTok arrives in the drafts 10 min before, without caption. */
export function agentPublishingRow(userId: string, platform: Platform, input: AgentPostInput) {
  const scheduledAt = sendsToDrafts(platform) ? new Date(input.postAt.getTime() - DRAFT_LEAD_MINUTES * 60_000) : input.postAt;
  return {
    user_id: userId,
    connection_id: input.connectionId,
    video_job_id: input.videoJobId,
    status: 'awaiting_approval' as const,
    scheduled_at: scheduledAt.toISOString(),
    idempotency_key: `video:${input.videoJobId}:${input.connectionId}:${input.format}:${scheduledAt.toISOString()}`,
    data: {
      kind: 'video',
      format: input.format,
      title: input.title.trim(),
      caption: sendsToDrafts(platform) ? '' : input.caption,
      postAt: input.postAt.toISOString(),
      media: [],
      proposedBy: 'escritorio',
      ...(platform === 'youtube' ? { uploader: 'studio', privacy: input.privacy } : {}),
    },
  };
}

export interface AgentVideoRequest {
  channel: string;
  title: string;
  brief: string;
  formats: Format[];
  projectId: string | null;
}

export function agentVideoProblems(input: AgentVideoRequest): string[] {
  const problems: string[] = [];
  if (!(AGENT_CHANNELS as readonly string[]).includes(input.channel)) problems.push(`Canal desconhecido. Use: ${AGENT_CHANNELS.join(', ')}.`);
  if (!input.title.trim() || input.title.length > MAX_TITLE) problems.push(`Título de 1 a ${MAX_TITLE} caracteres.`);
  if (input.brief.trim().length < 20 || input.brief.length > MAX_BRIEF) problems.push('Briefing de 20 a 4000 caracteres (o roteiro sai dele).');
  if (input.formats.length === 0 || input.formats.some((format) => format !== 'long' && format !== 'vertical')) problems.push('Formatos: long e/ou vertical.');
  return problems;
}
