/**
 * Rules of the local studio's side of the Fábrica, pure so vitest covers them (`npm test`):
 * the studio key format, which files it may send back, when a job it took counts as abandoned,
 * and the summary of measured results that goes into a new script.
 */

export const STUDIO_KEY_PATTERN = /^fsk_[0-9a-f]{64}$/;
/** A job without a heartbeat for this long went down with the studio (PC off, crash): back to the queue. */
export const STALE_MINUTES = 20;
export const MAX_JOB_ATTEMPTS = 3;
/** A YouTube upload sends a checkpoint at least this often; past it, the job goes back to "scheduled". */
export const UPLOAD_STALE_MINUTES = 30;

export const OUTPUT_FILES = {
  'vertical.mp4': 'video/mp4',
  'long-preview.mp4': 'video/mp4',
  'thumbnail.jpg': 'image/jpeg',
  'thumbnail-vertical.jpg': 'image/jpeg',
} as const;
export type OutputFile = keyof typeof OUTPUT_FILES;

export function isOutputFile(name: unknown): name is OutputFile {
  return typeof name === 'string' && Object.hasOwn(OUTPUT_FILES, name);
}

/** Every attempt writes to its own folder, so a retry never overwrites what an approval may be using. */
export function outputFolder(userId: string, jobId: string, attempt: number): string {
  return `${userId}/${jobId}/${attempt}`;
}

export interface VideoFile {
  /** Path in the studio-media bucket (vertical, previews and covers). */
  path: string | null;
  /** Full path on the studio's machine (the long video lives only there, too big for Storage). */
  localFile: string | null;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface StudioOutputs {
  long?: VideoFile & { previewPath: string | null };
  vertical?: VideoFile;
  thumbnail?: string;
  thumbnailVertical?: string;
}

const MAX_LOCAL_PATH = 400;

function storagePath(value: unknown, folder: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.startsWith(`${folder}/`)) throw new Error('arquivo fora da pasta do pedido');
  if (!isOutputFile(value.slice(folder.length + 1))) throw new Error('nome de arquivo não aceito');
  return value;
}

function localFile(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > MAX_LOCAL_PATH || !/\.mp4$/i.test(value)) throw new Error('caminho local inválido');
  return value;
}

function positive(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : 0;
}

function videoFile(raw: unknown, folder: string): VideoFile {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    path: storagePath(value.path, folder),
    localFile: localFile(value.localFile),
    durationSec: positive(value.durationSec, 6 * 60 * 60),
    width: positive(value.width, 8192),
    height: positive(value.height, 8192),
    sizeBytes: positive(value.sizeBytes, 256 * 1024 ** 3),
  };
}

/** What the studio reports as done, checked against the job's own folder; anything else is refused. */
export function sanitizeOutputs(raw: unknown, folder: string, formats: string[]): StudioOutputs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('resultado em formato inválido');
  const value = raw as Record<string, unknown>;
  const outputs: StudioOutputs = {};
  if (formats.includes('long')) {
    const long = videoFile(value.long, folder);
    if (!long.localFile && !long.path) throw new Error('faltou o vídeo longo');
    outputs.long = { ...long, previewPath: storagePath((value.long as Record<string, unknown> | undefined)?.previewPath, folder) };
  }
  if (formats.includes('vertical')) {
    const vertical = videoFile(value.vertical, folder);
    if (!vertical.path) throw new Error('faltou o vídeo vertical no Storage');
    outputs.vertical = vertical;
  }
  const thumbnail = storagePath(value.thumbnail, folder);
  if (thumbnail) outputs.thumbnail = thumbnail;
  const thumbnailVertical = storagePath(value.thumbnailVertical, folder);
  if (thumbnailVertical) outputs.thumbnailVertical = thumbnailVertical;
  return outputs;
}

export type StaleDecision = { status: 'queued' } | { status: 'failed'; error: string } | null;

/** A job the studio took and stopped reporting on: retried while attempts last, then failed with a reason. */
export function staleDecision(job: { status: string; heartbeat_at: string | null; attempts: number }, now: Date): StaleDecision {
  if (job.status !== 'working') return null;
  const last = job.heartbeat_at ? new Date(job.heartbeat_at).getTime() : 0;
  if (now.getTime() - last < STALE_MINUTES * 60_000) return null;
  if (job.attempts >= MAX_JOB_ATTEMPTS) return { status: 'failed', error: `O estúdio parou de responder ${MAX_JOB_ATTEMPTS} vezes nesse vídeo. Confere o log no PC e manda refazer.` };
  return { status: 'queued' };
}

export interface MeasuredPost {
  title: string;
  caption: string;
  platform: string;
  mediaType: string;
  publishedAt: string | null;
  metrics: Record<string, number>;
}

export interface ResultsBrief {
  measured: number;
  best: string[];
  worst: string[];
}

const MIN_POSTS = 3;
const firstLine = (text: string) => (text.split('\n').find((line) => line.trim()) ?? '').trim().slice(0, 140);
const describe = (post: MeasuredPost) => {
  const numbers = ['views', 'likes', 'comments', 'shares', 'saves'].filter((key) => post.metrics[key] !== undefined).map((key) => `${key} ${post.metrics[key]}`);
  return `[${post.platform}/${post.mediaType}] "${firstLine(post.title || post.caption)}" (${numbers.join(', ')})`;
};

/**
 * Best and worst posts by views, as measured lines for the script prompt. Only posts with views count, and
 * with fewer than MIN_POSTS there is no comparison worth making (empty lists, never a guess).
 */
export function resultsBrief(posts: MeasuredPost[], size = 5): ResultsBrief {
  const measured = posts.filter((post) => typeof post.metrics.views === 'number');
  if (measured.length < MIN_POSTS) return { measured: measured.length, best: [], worst: [] };
  const ranked = [...measured].sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0));
  const half = Math.min(size, Math.floor(ranked.length / 2));
  return { measured: measured.length, best: ranked.slice(0, half).map(describe), worst: ranked.slice(-half).reverse().map(describe) };
}

/** YouTube limits: title up to 100 characters, description up to 5000, and neither accepts < or >. */
export function youtubeText(title: string, description: string): { title: string; description: string } {
  const clean = (text: string) => text.replace(/[<>]/g, '');
  const shortTitle = clean(title).trim().slice(0, 100) || 'Vídeo';
  return { title: shortTitle, description: clean(description).slice(0, 5000) };
}
