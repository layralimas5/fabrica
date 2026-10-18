import type { Carousel, CarouselFormat } from '../carousel';
import type { SocialConnection } from '../social/connection';

/**
 * Automatic publishing through the official APIs: Instagram (content publishing) and Facebook pages get the post
 * itself; TikTok gets the carousel in the account's drafts (upload mode), since posting directly needs a TikTok
 * audit this app does not have. The owner finishes the TikTok post in the app.
 */

export const JOB_STATUSES = ['awaiting_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_INFO: Record<JobStatus, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  awaiting_approval: { label: 'Aguardando aprovação', tone: 'warning' },
  scheduled: { label: 'Agendado', tone: 'accent' },
  publishing: { label: 'Publicando', tone: 'accent' },
  published: { label: 'Publicado', tone: 'success' },
  failed: { label: 'Falhou', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export interface PublishingJob {
  id: string;
  connectionId: string;
  carouselId: string | null;
  status: JobStatus;
  /** When the queue sends it. For TikTok drafts, a few minutes before postAt. */
  scheduledAt: string;
  /** When the owner wants it live: the time she picked. */
  postAt: string;
  idempotencyKey: string;
  attempts: number;
  approvedAt: string | null;
  externalId: string | null;
  permalink: string | null;
  lastError: string | null;
  caption: string;
  /** Storage paths of the approved images (publish-media bucket), in slide order. */
  media: string[];
  title: string;
  createdAt: string;
}

export const MAX_CAPTION = 2200;
export const MAX_HASHTAGS = 30;
export const MAX_ATTEMPTS = 3;

/** Proportions the Instagram feed accepts for images (between 4:5 and 1.91:1). */
const INSTAGRAM_FEED_FORMATS: CarouselFormat[] = ['4:5', '1:1'];
const PUBLISH_SCOPES: Record<SocialConnection['platform'], string> = { instagram: 'instagram_business_content_publish', facebook: 'pages_manage_posts', tiktok: 'video.upload' };

/** Connected for reading, but without the permission to send posts: it needs to authorize again. */
export function missesPublishScope(connection: Pick<SocialConnection, 'platform' | 'status' | 'scopes'>): boolean {
  return connection.status === 'connected' && connection.scopes.length > 0 && !connection.scopes.includes(PUBLISH_SCOPES[connection.platform]);
}

/** Every connected network takes part in the queue; TikTok as drafts (see sendsToDrafts). */
export function canAutoPublish(connection: Pick<SocialConnection, 'platform'>): boolean {
  return connection.platform in PUBLISH_SCOPES;
}

/** A TikTok draft arrives this much before the posting time, so it is waiting when the time comes. */
export const DRAFT_LEAD_MINUTES = 10;

/** When the queue should send a post meant to go live at postAt. */
export function sendTimeFor(platform: SocialConnection['platform'], postAt: Date): Date {
  return sendsToDrafts(platform) ? new Date(postAt.getTime() - DRAFT_LEAD_MINUTES * 60_000) : postAt;
}

/** TikTok receives the carousel in the drafts: the owner adds the music and posts it in the app. */
export function sendsToDrafts(platform: SocialConnection['platform'] | undefined): boolean {
  return platform === 'tiktok';
}

/** "Publicado" means live for Instagram and Facebook, but only "in the drafts" for TikTok. */
export function jobStatusInfo(status: JobStatus, platform: SocialConnection['platform'] | undefined): { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' } {
  if (sendsToDrafts(platform) && status === 'published') return { label: 'Nos rascunhos do TikTok', tone: 'success' };
  if (sendsToDrafts(platform) && status === 'publishing') return { label: 'Enviando aos rascunhos', tone: 'accent' };
  return JOB_STATUS_INFO[status];
}

/** Everything that would make the network refuse the post, checked before the job is even created. */
export function publishProblems(carousel: Pick<Carousel, 'format' | 'slides' | 'caption'>, connection: Pick<SocialConnection, 'platform' | 'status' | 'scopes'>, scheduledAt: Date, now: Date): string[] {
  const problems: string[] = [];
  if (!canAutoPublish(connection)) problems.push('Essa rede não tem publicação pela fila: use a publicação assistida.');
  else {
    if (connection.status !== 'connected') problems.push('A conta não está conectada. Reconecta antes de agendar.');
    const scope = PUBLISH_SCOPES[connection.platform];
    if (connection.scopes.length && !connection.scopes.includes(scope)) problems.push(`A conta não deu a permissão ${scope}. Reconecta e aceita a publicação.`);
    if (connection.platform === 'instagram' && !INSTAGRAM_FEED_FORMATS.includes(carousel.format)) problems.push(`O feed do Instagram não aceita ${carousel.format} em carrossel: use 4:5 ou 1:1.`);
  }
  if (carousel.slides.length < 1 || carousel.slides.length > 10) problems.push('A publicação precisa ter de 1 a 10 imagens.');
  if (carousel.caption.length > MAX_CAPTION) problems.push(`A legenda passa de ${MAX_CAPTION} caracteres.`);
  if ((carousel.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > MAX_HASHTAGS) problems.push(`A legenda tem mais de ${MAX_HASHTAGS} hashtags.`);
  if (scheduledAt.getTime() < now.getTime() + 5 * 60 * 1000) problems.push('Escolhe um horário pelo menos 5 minutos à frente.');
  return problems;
}

export function idempotencyKey(carouselId: string, connectionId: string, scheduledAt: Date): string {
  return `${carouselId}:${connectionId}:${scheduledAt.toISOString()}`;
}

/** Where a carousel stands in the queue: the most recent job that is not cancelled. */
export function activeJobFor(jobs: PublishingJob[], carouselId: string): PublishingJob | null {
  return jobs.filter((job) => job.carouselId === carouselId && job.status !== 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** "2026-10-20" + "19:00" in São Paulo (UTC-3, no daylight saving since 2019). */
export function saoPauloDate(day: string, time: string): Date {
  return new Date(`${day}T${time}:00-03:00`);
}
