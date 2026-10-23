import type { SocialConnection } from '../social/connection';
import { publishScopeFor, sendsToDrafts } from '../publishing/job';

/**
 * A video asked of the local studio. The Fábrica keeps the request, the review and the publishing; the studio
 * (the owner's PC) writes the script, renders it in Remotion and sends the files back.
 */

export const VIDEO_FORMATS = ['long', 'vertical'] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export const VIDEO_FORMAT_LABELS: Record<VideoFormat, string> = { long: 'Longo 16:9 (YouTube)', vertical: 'Vertical 9:16 (Shorts, Reels, TikTok)' };

export const VIDEO_MODES = ['create', 'render'] as const;
export type VideoMode = (typeof VIDEO_MODES)[number];
export const VIDEO_MODE_LABELS: Record<VideoMode, string> = { create: 'Criar do zero (roteiro, voz e montagem)', render: 'Só renderizar uma composição pronta' };

export const VIDEO_STATUSES = ['queued', 'working', 'ready', 'failed', 'cancelled'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];
export const VIDEO_STATUS_INFO: Record<VideoStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  queued: { label: 'Na fila do estúdio', tone: 'neutral' },
  working: { label: 'No estúdio', tone: 'accent' },
  ready: { label: 'Pronto para revisar', tone: 'success' },
  failed: { label: 'Falhou', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

/** Channels the studio knows (its studio.config.json says which project and skill each one uses). */
export interface StudioChannel {
  id: string;
  label: string;
  modes: VideoMode[];
  note: string;
}

export const STUDIO_CHANNELS: StudioChannel[] = [
  { id: 'nivora', label: 'Nivora', modes: ['create', 'render'], note: 'Formato RunnyIA aprovado (skill video-nivora): gente real, anime, meme e tela real.' },
  { id: 'ohlayralm', label: '@ohlayralm', modes: ['create', 'render'], note: 'Perfil pessoal, formato Fórmula. Nunca sobre tráfego pago.' },
  { id: 'omnxdepp', label: 'OMNXDEPP', modes: ['create', 'render'], note: 'Música pro TikTok americano, texto em inglês (skill video-musica-tiktok).' },
  { id: 'lumo', label: 'Universo Lumo', modes: ['render'], note: 'As sagas vão uma etapa por pedido com a Lay; aqui o estúdio só renderiza o capítulo pronto.' },
];

export function channelById(id: string): StudioChannel | null {
  return STUDIO_CHANNELS.find((channel) => channel.id === id) ?? null;
}

export interface VideoFile {
  path: string | null;
  localFile: string | null;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface VideoOutputs {
  long?: VideoFile & { previewPath: string | null };
  vertical?: VideoFile;
  thumbnail?: string;
  thumbnailVertical?: string;
}

export interface VideoJob {
  id: string;
  projectId: string | null;
  channel: string;
  mode: VideoMode;
  title: string;
  brief: string;
  formats: VideoFormat[];
  compositions: Partial<Record<VideoFormat, string>>;
  status: VideoStatus;
  step: string | null;
  progress: number;
  attempts: number;
  heartbeatAt: string | null;
  outputs: VideoOutputs;
  caption: string;
  lastError: string | null;
  log: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoJobInput {
  projectId: string | null;
  channel: string;
  mode: VideoMode;
  title: string;
  brief: string;
  formats: VideoFormat[];
  compositions: Partial<Record<VideoFormat, string>>;
}

export const LIMITS = { title: 120, brief: 4000, caption: 5000, composition: 80 } as const;
const COMPOSITION_ID = /^[A-Za-z0-9-]{1,80}$/;

/** What would make the studio refuse or guess: checked before the request goes to the queue. */
export function videoJobProblems(input: VideoJobInput): string[] {
  const problems: string[] = [];
  const channel = channelById(input.channel);
  if (!channel) problems.push('Escolhe o canal.');
  else if (!channel.modes.includes(input.mode)) problems.push(`${channel.label} só aceita: ${channel.modes.map((mode) => VIDEO_MODE_LABELS[mode].toLowerCase()).join(', ')}.`);
  if (!input.title.trim()) problems.push('Dá um título pro vídeo.');
  if (input.title.length > LIMITS.title) problems.push(`O título passa de ${LIMITS.title} caracteres.`);
  if (!input.formats.length) problems.push('Escolhe pelo menos um formato.');
  if (input.mode === 'create' && input.brief.trim().length < 20) problems.push('Conta o tema com um pouco mais de detalhe (o roteiro sai dele).');
  if (input.brief.length > LIMITS.brief) problems.push(`O briefing passa de ${LIMITS.brief} caracteres.`);
  if (input.mode === 'render') {
    for (const format of input.formats) {
      const id = input.compositions[format] ?? '';
      if (!COMPOSITION_ID.test(id)) problems.push(`Informa o id da composição do Remotion para o ${format === 'long' ? 'longo' : 'vertical'} (ex.: TutorialCanal).`);
    }
  }
  return problems;
}

export function sanitizeVideoJobInput(input: VideoJobInput): VideoJobInput {
  const formats = VIDEO_FORMATS.filter((format) => input.formats.includes(format));
  const compositions: Partial<Record<VideoFormat, string>> = {};
  if (input.mode === 'render') for (const format of formats) if (input.compositions[format]) compositions[format] = input.compositions[format]!.trim().slice(0, LIMITS.composition);
  return { ...input, title: input.title.trim().slice(0, LIMITS.title), brief: input.brief.trim().slice(0, LIMITS.brief), formats, compositions };
}

/** The studio is considered online when it said something in the last few minutes. */
export const STUDIO_ONLINE_MINUTES = 3;

export function studioOnline(lastSeenAt: string | null, now: Date): boolean {
  return Boolean(lastSeenAt && now.getTime() - new Date(lastSeenAt).getTime() < STUDIO_ONLINE_MINUTES * 60_000);
}

// Publishing a ready video ---------------------------------------------------------------

export type VideoPrivacy = 'public' | 'unlisted' | 'private';
export const VIDEO_PRIVACY_LABELS: Record<VideoPrivacy, string> = { public: 'Público', unlisted: 'Não listado', private: 'Privado' };

/** Formats each network takes from the studio. Instagram, TikTok and Shorts only vertical. */
export function formatsFor(platform: SocialConnection['platform']): VideoFormat[] {
  if (platform === 'youtube' || platform === 'facebook') return ['long', 'vertical'];
  return ['vertical'];
}

const MAX_SECONDS: Record<SocialConnection['platform'], Record<VideoFormat, number>> = {
  instagram: { long: 0, vertical: 15 * 60 },
  tiktok: { long: 0, vertical: 10 * 60 },
  facebook: { long: 4 * 60 * 60, vertical: 4 * 60 * 60 },
  // Vertical on YouTube is a Short: up to 3 minutes.
  youtube: { long: 12 * 60 * 60, vertical: 3 * 60 },
};

export const MAX_TEXT: Record<SocialConnection['platform'], number> = { instagram: 2200, facebook: 5000, tiktok: 2200, youtube: 5000 };

export interface VideoPublishPlan {
  format: VideoFormat;
  title: string;
  caption: string;
  privacy: VideoPrivacy;
  postAt: Date;
}

/** Everything that would make the network refuse the video, checked before the job is created. */
export function videoPublishProblems(job: Pick<VideoJob, 'status' | 'outputs'>, connection: Pick<SocialConnection, 'platform' | 'status' | 'scopes'>, plan: VideoPublishPlan, now: Date): string[] {
  const problems: string[] = [];
  if (job.status !== 'ready') problems.push('O vídeo ainda não está pronto.');
  if (connection.status !== 'connected') problems.push('A conta não está conectada. Reconecta antes de agendar.');
  const scope = publishScopeFor(connection.platform);
  if (connection.scopes.length && !connection.scopes.includes(scope)) problems.push(`A conta não deu a permissão ${scope}. Reconecta e aceita a publicação.`);
  if (!formatsFor(connection.platform).includes(plan.format)) problems.push('Essa rede só recebe o vídeo vertical.');
  const file = plan.format === 'long' ? job.outputs.long : job.outputs.vertical;
  if (!file) problems.push(`Esse pedido não tem o vídeo ${plan.format === 'long' ? 'longo' : 'vertical'}.`);
  else {
    if (plan.format === 'long' && connection.platform !== 'youtube' && !file.path) problems.push('O longo só existe no PC (grande demais pro Storage): ele vai só para o YouTube.');
    const limit = MAX_SECONDS[connection.platform][plan.format];
    if (file.durationSec > limit) problems.push(`O vídeo tem ${Math.round(file.durationSec)} s e essa rede aceita até ${limit} s nesse formato.`);
  }
  if (connection.platform === 'youtube' && !plan.title.trim()) problems.push('O YouTube precisa de título.');
  if (connection.platform === 'youtube' && /[<>]/.test(plan.title + plan.caption)) problems.push('O YouTube não aceita < nem > no título e na descrição.');
  if (plan.caption.length > MAX_TEXT[connection.platform]) problems.push(`O texto passa de ${MAX_TEXT[connection.platform]} caracteres.`);
  if (plan.postAt.getTime() < now.getTime() + 5 * 60 * 1000) problems.push('Escolhe um horário pelo menos 5 minutos à frente.');
  return problems;
}

/** TikTok gets the video in the drafts with no caption: the owner writes it in the app. */
export function captionGoesToNetwork(platform: SocialConnection['platform']): boolean {
  return !sendsToDrafts(platform);
}

export function videoIdempotencyKey(videoJobId: string, connectionId: string, format: VideoFormat, scheduledAt: Date): string {
  return `video:${videoJobId}:${connectionId}:${format}:${scheduledAt.toISOString()}`;
}

/** "08:12" or "1:02:03". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
