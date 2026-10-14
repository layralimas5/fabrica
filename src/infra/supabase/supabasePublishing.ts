import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewJob, PublishingService } from '../../application/ports';
import { idempotencyKey, JOB_STATUSES, type JobStatus, type PublishingJob } from '../../domain/publishing/job';
import { fail } from './supabaseServices';
import { invokeFunction } from './supabaseSocial';

const BUCKET = 'publish-media';

interface JobRow {
  id: string;
  connection_id: string;
  carousel_id: string | null;
  status: string;
  scheduled_at: string;
  idempotency_key: string;
  attempts: number;
  approved_at: string | null;
  external_id: string | null;
  permalink: string | null;
  last_error: string | null;
  data: { caption?: string; media?: string[]; title?: string };
  created_at: string;
}

const rowToJob = (row: JobRow): PublishingJob => ({
  id: row.id,
  connectionId: row.connection_id,
  carouselId: row.carousel_id,
  status: JOB_STATUSES.includes(row.status as JobStatus) ? (row.status as JobStatus) : 'failed',
  scheduledAt: row.scheduled_at,
  idempotencyKey: row.idempotency_key,
  attempts: row.attempts,
  approvedAt: row.approved_at,
  externalId: row.external_id,
  permalink: row.permalink,
  lastError: row.last_error,
  caption: row.data?.caption ?? '',
  media: Array.isArray(row.data?.media) ? row.data.media : [],
  title: row.data?.title ?? '',
  createdAt: row.created_at,
});

export class SupabasePublishing implements PublishingService {
  readonly available = true;

  constructor(private readonly client: SupabaseClient) {}

  async listJobs(): Promise<PublishingJob[]> {
    const { data, error } = await this.client.from('publishing_jobs').select('*').order('scheduled_at', { ascending: false }).limit(500);
    if (error) fail('Não consegui carregar a fila de publicação', error);
    return (data as JobRow[]).map(rowToJob);
  }

  async createJob(input: NewJob): Promise<PublishingJob> {
    const scheduledAt = new Date(input.scheduledAt);
    const { data, error } = await this.client
      .from('publishing_jobs')
      .insert({
        connection_id: input.connectionId,
        carousel_id: input.carouselId,
        scheduled_at: scheduledAt.toISOString(),
        idempotency_key: idempotencyKey(input.carouselId, input.connectionId, scheduledAt),
        data: { caption: input.caption, title: input.title, media: [] },
      })
      .select()
      .single();
    if (error?.code === '23505') throw new Error('Esse carrossel já está na fila para essa conta nesse horário.');
    if (error) fail('Não consegui agendar', error);
    return rowToJob(data as JobRow);
  }

  /** Uploads the rendered slides and moves the job to the queue. A new approval uses a new folder, never overwriting. */
  async approve(job: PublishingJob, images: Blob[]): Promise<PublishingJob> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Sessão expirada. Entra de novo.');
    const folder = `${auth.user.id}/${job.id}/${Date.now()}`;
    const paths: string[] = [];
    for (const [index, image] of images.entries()) {
      const path = `${folder}/${String(index + 1).padStart(2, '0')}.jpg`;
      const { error } = await this.client.storage.from(BUCKET).upload(path, image, { contentType: 'image/jpeg' });
      if (error) fail(`Não consegui enviar a imagem ${index + 1}`, error);
      paths.push(path);
    }
    const { data, error } = await this.client
      .from('publishing_jobs')
      .update({ status: 'scheduled', approved_at: new Date().toISOString(), attempts: 0, next_attempt_at: null, last_error: null, data: { caption: job.caption, title: job.title, media: paths } })
      .eq('id', job.id)
      .eq('status', 'awaiting_approval')
      .select()
      .maybeSingle();
    if (error) fail('Não consegui aprovar', error);
    if (!data) throw new Error('Esse agendamento mudou enquanto você aprovava. Atualiza a página.');
    return rowToJob(data as JobRow);
  }

  async cancel(jobId: string): Promise<PublishingJob> {
    return this.setStatus(jobId, 'cancelled', ['awaiting_approval', 'scheduled', 'failed']);
  }

  /** A failed post goes back to approval: publishing again is always an explicit decision. */
  async retry(jobId: string): Promise<PublishingJob> {
    return this.setStatus(jobId, 'awaiting_approval', ['failed']);
  }

  async processNow(): Promise<{ processed: number }> {
    return invokeFunction<{ processed: number }>(this.client, 'publish-worker', { action: 'run-mine' });
  }

  private async setStatus(jobId: string, status: JobStatus, from: JobStatus[]): Promise<PublishingJob> {
    const { data, error } = await this.client.from('publishing_jobs').update({ status }).eq('id', jobId).in('status', from).select().maybeSingle();
    if (error) fail('Não consegui atualizar o agendamento', error);
    if (!data) throw new Error('Esse agendamento já mudou de estado. Atualiza a página.');
    return rowToJob(data as JobRow);
  }
}
