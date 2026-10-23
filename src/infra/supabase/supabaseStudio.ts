import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudioLink, StudioService } from '../../application/ports';
import type { PublishingJob } from '../../domain/publishing/job';
import type { SocialConnection } from '../../domain/social/connection';
import { captionGoesToNetwork, VIDEO_FORMATS, VIDEO_MODES, VIDEO_STATUSES, videoIdempotencyKey, type VideoFormat, type VideoJob, type VideoJobInput, type VideoMode, type VideoOutputs, type VideoPublishPlan, type VideoStatus } from '../../domain/studio/videoJob';
import { rowToJob, type JobRow } from './supabasePublishing';
import { fail } from './supabaseServices';
import { invokeFunction } from './supabaseSocial';

const BUCKET = 'studio-media';
const PREVIEW_SECONDS = 3600;

interface VideoJobRow {
  id: string;
  project_id: string | null;
  channel: string;
  mode: string;
  title: string;
  brief: string;
  formats: string[];
  compositions: Record<string, string> | null;
  status: string;
  step: string | null;
  progress: number;
  attempts: number;
  heartbeat_at: string | null;
  outputs: VideoOutputs | null;
  caption: string;
  last_error: string | null;
  log: string;
  created_at: string;
  updated_at: string;
}

const rowToVideoJob = (row: VideoJobRow): VideoJob => ({
  id: row.id,
  projectId: row.project_id,
  channel: row.channel,
  mode: VIDEO_MODES.includes(row.mode as VideoMode) ? (row.mode as VideoMode) : 'render',
  title: row.title,
  brief: row.brief,
  formats: VIDEO_FORMATS.filter((format) => (row.formats ?? []).includes(format)),
  compositions: (row.compositions ?? {}) as Partial<Record<VideoFormat, string>>,
  status: VIDEO_STATUSES.includes(row.status as VideoStatus) ? (row.status as VideoStatus) : 'failed',
  step: row.step,
  progress: row.progress,
  attempts: row.attempts,
  heartbeatAt: row.heartbeat_at,
  outputs: row.outputs ?? {},
  caption: row.caption,
  lastError: row.last_error,
  log: row.log,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Paths of every file a request left in Storage (previews, vertical, covers). */
function storedPaths(outputs: VideoOutputs): string[] {
  return [outputs.long?.path, outputs.long?.previewPath, outputs.vertical?.path, outputs.thumbnail, outputs.thumbnailVertical].filter((path): path is string => Boolean(path));
}

export class SupabaseStudio implements StudioService {
  readonly available = true;

  constructor(private readonly client: SupabaseClient) {}

  async listJobs(): Promise<VideoJob[]> {
    const { data, error } = await this.client.from('video_jobs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) fail('Não consegui carregar os vídeos do estúdio', error);
    return (data as VideoJobRow[]).map(rowToVideoJob);
  }

  async createJob(input: VideoJobInput): Promise<VideoJob> {
    const { data, error } = await this.client
      .from('video_jobs')
      .insert({ project_id: input.projectId, channel: input.channel, mode: input.mode, title: input.title, brief: input.brief, formats: input.formats, compositions: input.compositions })
      .select()
      .single();
    if (error) fail('Não consegui mandar o pedido pro estúdio', error);
    return rowToVideoJob(data as VideoJobRow);
  }

  async updateJob(id: string, patch: Partial<Pick<VideoJob, 'title' | 'caption'>>): Promise<VideoJob> {
    const { data, error } = await this.client.from('video_jobs').update(patch).eq('id', id).select().single();
    if (error) fail('Não consegui salvar', error);
    return rowToVideoJob(data as VideoJobRow);
  }

  cancel(id: string): Promise<VideoJob> {
    return this.setStatus(id, 'cancelled');
  }

  requeue(id: string): Promise<VideoJob> {
    return this.setStatus(id, 'queued');
  }

  async remove(job: VideoJob): Promise<void> {
    const paths = storedPaths(job.outputs);
    if (paths.length) {
      const { error: storageError } = await this.client.storage.from(BUCKET).remove(paths);
      if (storageError) fail('Não consegui apagar os arquivos do vídeo', storageError);
    }
    const { error } = await this.client.from('video_jobs').delete().eq('id', job.id);
    if (error) fail('Não consegui apagar o pedido', error);
  }

  async fileUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrl(path, PREVIEW_SECONDS);
    if (error || !data) fail('Não consegui abrir o arquivo', error);
    return data.signedUrl;
  }

  async link(): Promise<StudioLink> {
    const { data, error } = await this.client.from('studio_keys').select('created_at, last_seen_at, worker_info').maybeSingle();
    if (error) fail('Não consegui ler o estado do estúdio', error);
    return { connected: Boolean(data), createdAt: data?.created_at ?? null, lastSeenAt: data?.last_seen_at ?? null, workerInfo: (data?.worker_info as StudioLink['workerInfo']) ?? null };
  }

  async createKey(): Promise<string> {
    return (await invokeFunction<{ key: string }>(this.client, 'studio', { action: 'create-key' })).key;
  }

  async revokeKey(): Promise<void> {
    await invokeFunction(this.client, 'studio', { action: 'revoke-key' });
  }

  async schedule(job: VideoJob, connection: Pick<SocialConnection, 'id' | 'platform'>, plan: VideoPublishPlan, scheduledAt: Date): Promise<PublishingJob> {
    const youtube = connection.platform === 'youtube';
    const data = {
      kind: 'video',
      format: plan.format,
      title: plan.title,
      caption: captionGoesToNetwork(connection.platform) ? plan.caption : '',
      postAt: plan.postAt.toISOString(),
      media: [],
      ...(youtube ? { uploader: 'studio', privacy: plan.privacy } : {}),
    };
    const { data: created, error } = await this.client
      .from('publishing_jobs')
      .insert({ connection_id: connection.id, video_job_id: job.id, scheduled_at: scheduledAt.toISOString(), idempotency_key: videoIdempotencyKey(job.id, connection.id, plan.format, scheduledAt), data })
      .select()
      .single();
    if (error?.code === '23505') throw new Error('Esse vídeo já está na fila para essa conta nesse horário.');
    if (error) fail('Não consegui agendar', error);
    const { data: approved, error: approveError } = await this.client
      .from('publishing_jobs')
      .update({ status: 'scheduled', approved_at: new Date().toISOString() })
      .eq('id', (created as JobRow).id)
      .eq('status', 'awaiting_approval')
      .select()
      .single();
    if (approveError) fail('Agendei, mas não consegui aprovar. Aprova na fila do Calendário', approveError);
    return rowToJob(approved as JobRow);
  }

  private async setStatus(id: string, status: VideoStatus): Promise<VideoJob> {
    const { data, error } = await this.client.from('video_jobs').update({ status }).eq('id', id).select().single();
    if (error) fail('Não consegui mudar o estado do pedido', error);
    return rowToVideoJob(data as VideoJobRow);
  }
}
