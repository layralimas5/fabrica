import { VISUAL_STYLES, type VisualStyle } from '../brandKit';
import { normalizeTags, normalizeTime } from '../carousel';
import { CONTENT_TYPES, OBJECTIVES, type ContentType, type Objective, type SlideRole } from '../content';
import type { ContentDna } from './dna';

/**
 * A published piece of content with its results. Winners are the ones marked by hand;
 * the others are tracked results (e.g. variations of a winner) that still feed analysis and insights.
 */

export const CONTENT_PLATFORMS = ['tiktok', 'instagram', 'outros'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const CONTENT_PLATFORM_LABELS: Record<ContentPlatform, string> = { tiktok: 'TikTok', instagram: 'Instagram', outros: 'Outros' };

export const CONTENT_FORMATS = [
  'carrossel',
  'ugc',
  'pov',
  'video_narrado',
  'screen_recording',
  'tutorial',
  'storytelling',
  'opiniao',
  'demonstracao',
  'outros',
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  carrossel: 'Carrossel',
  ugc: 'UGC',
  pov: 'POV',
  video_narrado: 'Vídeo narrado',
  screen_recording: 'Screen recording',
  tutorial: 'Tutorial',
  storytelling: 'Storytelling',
  opiniao: 'Opinião',
  demonstracao: 'Demonstração de produto',
  outros: 'Outros',
};

export const PILLARS = [
  'dor',
  'identificacao',
  'habitos',
  'disciplina',
  'metas',
  'produtividade',
  'procrastinacao',
  'organizacao',
  'evolucao',
  'desenvolvimento_pessoal',
  'produto',
  'educacao',
  'conversao',
  'outros',
] as const;
export type Pillar = (typeof PILLARS)[number];
export const PILLAR_LABELS: Record<Pillar, string> = {
  dor: 'Dor',
  identificacao: 'Identificação',
  habitos: 'Hábitos',
  disciplina: 'Disciplina',
  metas: 'Metas',
  produtividade: 'Produtividade',
  procrastinacao: 'Procrastinação',
  organizacao: 'Organização',
  evolucao: 'Evolução',
  desenvolvimento_pessoal: 'Desenvolvimento pessoal',
  produto: 'Produto',
  educacao: 'Educação',
  conversao: 'Conversão',
  outros: 'Outros',
};

export const HOOK_TYPES = [
  'curiosidade',
  'confronto',
  'identificacao',
  'dor',
  'promessa',
  'erro_comum',
  'opiniao_forte',
  'contrarian',
  'pergunta',
  'historia',
  'antes_depois',
  'lista',
  'alerta',
  'confissao',
] as const;
export type HookType = (typeof HOOK_TYPES)[number];
export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  curiosidade: 'Curiosidade',
  confronto: 'Confronto',
  identificacao: 'Identificação',
  dor: 'Dor',
  promessa: 'Promessa',
  erro_comum: 'Erro comum',
  opiniao_forte: 'Opinião forte',
  contrarian: 'Contrarian',
  pergunta: 'Pergunta',
  historia: 'História',
  antes_depois: 'Antes e depois',
  lista: 'Lista',
  alerta: 'Alerta',
  confissao: 'Confissão',
};

export const PRODUCT_PRESENCES = ['nao_aparece', 'aparece', 'demo_direta', 'demo_indireta'] as const;
export type ProductPresence = (typeof PRODUCT_PRESENCES)[number];
export const PRODUCT_PRESENCE_LABELS: Record<ProductPresence, string> = {
  nao_aparece: 'Produto não aparece',
  aparece: 'Produto aparece',
  demo_direta: 'Demonstração direta',
  demo_indireta: 'Demonstração indireta',
};

export const WINNER_TYPES = ['alcance', 'valor', 'interesse', 'aquisicao', 'conversao'] as const;
export type WinnerType = (typeof WINNER_TYPES)[number];
export const WINNER_TYPE_INFO: Record<WinnerType, { emoji: string; label: string; short: string; detail: string }> = {
  alcance: { emoji: '🔥', label: 'Vencedor de alcance', short: 'Alcance', detail: 'Muitas visualizações' },
  valor: { emoji: '💾', label: 'Vencedor de valor', short: 'Valor', detail: 'Salvamentos e compartilhamentos' },
  interesse: { emoji: '👤', label: 'Vencedor de interesse', short: 'Interesse', detail: 'Visitas ao perfil e cliques' },
  aquisicao: { emoji: '🎯', label: 'Vencedor de aquisição', short: 'Aquisição', detail: 'Cadastros e trials' },
  conversao: { emoji: '💰', label: 'Vencedor de conversão', short: 'Conversão', detail: 'Vendas e receita' },
};

export const PERFORMANCE_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'follows', 'profileVisits', 'clicks', 'leads', 'signups', 'trials', 'sales', 'revenue'] as const;
export type PerformanceKey = (typeof PERFORMANCE_KEYS)[number];
export const PERFORMANCE_LABELS: Record<PerformanceKey, string> = {
  views: 'Visualizações',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  follows: 'Novos seguidores',
  profileVisits: 'Visitas ao perfil',
  clicks: 'Cliques no link',
  leads: 'Leads',
  signups: 'Cadastros',
  trials: 'Trials',
  sales: 'Vendas',
  revenue: 'Receita gerada',
};

/** Null means "not measured", which is different from zero. */
export type PerformanceMetrics = Record<PerformanceKey, number | null>;

/** The numbers of one day. A post is measured a few times while it grows, so its history tells how it is still moving. */
export interface MetricSnapshot {
  /** 'YYYY-MM-DD', the day the numbers were read in the app. One snapshot per day. */
  day: string;
  metrics: PerformanceMetrics;
}

/** Enough for months of measurements without the record growing forever. */
export const MAX_SNAPSHOTS = 60;

/** Which winner type each metric proves, so a card leads with the metrics that made it win. */
export const WINNER_TYPE_METRICS: Record<WinnerType, PerformanceKey[]> = {
  alcance: ['views'],
  valor: ['saves', 'shares'],
  interesse: ['profileVisits', 'clicks', 'follows'],
  aquisicao: ['leads', 'signups', 'trials'],
  conversao: ['sales', 'revenue'],
};

/** One slide of a carousel, or one beat/scene of a video script. */
export interface ScriptBeat {
  role: SlideRole | null;
  text: string;
}

/** Links content created from a winner back to it, so its family can be compared later. */
export interface ContentOrigin {
  modelId: string;
  modelTitle: string;
  kind: 'model' | 'variation' | 'family';
  /** Family name when created as part of a content family. */
  family: string | null;
}

export interface ContentRecord {
  id: string;
  /** Carousel made in the Fábrica, or null for content made elsewhere (UGC, POV, video). */
  carouselId: string | null;
  title: string;
  hook: string;
  /** Snapshot taken when the record was saved, so search and DNA survive edits or deletion of the carousel. */
  script: ScriptBeat[];
  platform: ContentPlatform;
  accountId: string | null;
  /** Free name for profiles not registered in Contas, e.g. "TikTok 2". */
  accountLabel: string;
  /** 'YYYY-MM-DD' */
  publishedAt: string | null;
  /** 'HH:MM' it went live, compared in Analytics as the posting time. */
  publishedTime: string | null;
  format: ContentFormat;
  theme: string;
  pillar: Pillar | null;
  /** What the content was made for and its narrative type, as chosen when it was created. */
  objective: Objective | null;
  contentType: Exclude<ContentType, 'auto'> | null;
  /** The call to action of the last slide or of the caption. */
  cta: string;
  caption: string;
  hookType: HookType | null;
  productPresence: ProductPresence | null;
  slideCount: number | null;
  metrics: PerformanceMetrics;
  /** When the numbers were last typed; they are usually updated a few times after posting. */
  metricsUpdatedAt: string | null;
  /** Every measurement, oldest first. `metrics` is always the latest one. */
  metricsHistory: MetricSnapshot[];
  /** Slide model the carousel was made with (Minimalista, TikTok…), compared in Analytics as the template. */
  visualStyle: VisualStyle | null;
  tags: string[];
  notes: string;
  winner: boolean;
  winnerTypes: WinnerType[];
  favorite: boolean;
  mainModel: boolean;
  dna: ContentDna | null;
  origin: ContentOrigin | null;
  createdAt: string;
  updatedAt: string;
}

export type ContentRecordInput = Omit<ContentRecord, 'id' | 'createdAt' | 'updatedAt'>;

export const LIMITS = { title: 120, hook: 300, cta: 300, caption: 2200, theme: 60, accountLabel: 40, notes: 2000, beats: 30, beatText: 600, slides: 30 } as const;

export function emptyPerformance(): PerformanceMetrics {
  return Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, null])) as PerformanceMetrics;
}

export function hasAnyMetric(metrics: PerformanceMetrics): boolean {
  return PERFORMANCE_KEYS.some((key) => metrics[key] !== null);
}

export function emptyRecordInput(): ContentRecordInput {
  return {
    carouselId: null,
    title: '',
    hook: '',
    script: [],
    platform: 'instagram',
    accountId: null,
    accountLabel: '',
    publishedAt: null,
    publishedTime: null,
    format: 'carrossel',
    theme: '',
    pillar: null,
    objective: null,
    contentType: null,
    cta: '',
    caption: '',
    hookType: null,
    productPresence: null,
    slideCount: null,
    metrics: emptyPerformance(),
    metricsUpdatedAt: null,
    metricsHistory: [],
    visualStyle: null,
    tags: [],
    notes: '',
    winner: true,
    winnerTypes: [],
    favorite: false,
    mainModel: false,
    dna: null,
    origin: null,
  };
}

/** Non-negative whole number (revenue keeps cents); anything else counts as not measured. */
export function sanitizePerformanceValue(key: PerformanceKey, raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return key === 'revenue' ? Math.round(value * 100) / 100 : Math.floor(value);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | null => (allowed.includes(value as T) ? (value as T) : null);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Trims, clamps and drops unknown values: everything saved goes through here (form input, backups, older versions). */
export function sanitizeRecordInput(raw: Partial<ContentRecordInput>): ContentRecordInput {
  const base = emptyRecordInput();
  const metrics = emptyPerformance();
  for (const key of PERFORMANCE_KEYS) metrics[key] = sanitizePerformanceValue(key, raw.metrics?.[key]);
  const slideCount = typeof raw.slideCount === 'number' && Number.isFinite(raw.slideCount) ? Math.min(LIMITS.slides, Math.max(1, Math.round(raw.slideCount))) : null;
  return {
    ...base,
    carouselId: typeof raw.carouselId === 'string' && raw.carouselId ? raw.carouselId : null,
    title: text(raw.title, LIMITS.title),
    hook: text(raw.hook, LIMITS.hook),
    script: (raw.script ?? [])
      .filter((beat) => beat && typeof beat.text === 'string' && beat.text.trim())
      .slice(0, LIMITS.beats)
      .map((beat) => ({ role: beat.role ?? null, text: beat.text.trim().slice(0, LIMITS.beatText) })),
    platform: oneOf(CONTENT_PLATFORMS, raw.platform) ?? base.platform,
    accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null,
    accountLabel: text(raw.accountLabel, LIMITS.accountLabel),
    publishedAt: typeof raw.publishedAt === 'string' && ISO_DAY.test(raw.publishedAt) ? raw.publishedAt : null,
    publishedTime: normalizeTime(raw.publishedTime),
    format: oneOf(CONTENT_FORMATS, raw.format) ?? base.format,
    theme: text(raw.theme, LIMITS.theme),
    pillar: oneOf(PILLARS, raw.pillar),
    objective: oneOf(OBJECTIVES, raw.objective),
    contentType: oneOf(CONTENT_TYPES.filter((type) => type !== 'auto'), raw.contentType) as ContentRecordInput['contentType'],
    cta: text(raw.cta, LIMITS.cta),
    caption: text(raw.caption, LIMITS.caption),
    hookType: oneOf(HOOK_TYPES, raw.hookType),
    productPresence: oneOf(PRODUCT_PRESENCES, raw.productPresence),
    slideCount,
    metrics,
    metricsUpdatedAt: typeof raw.metricsUpdatedAt === 'string' ? raw.metricsUpdatedAt : null,
    metricsHistory: sanitizeHistory(raw, metrics),
    visualStyle: oneOf(VISUAL_STYLES, raw.visualStyle),
    tags: normalizeTags(raw.tags ?? []),
    notes: text(raw.notes, LIMITS.notes),
    winner: raw.winner ?? base.winner,
    winnerTypes: [...new Set((raw.winnerTypes ?? []).filter((type) => WINNER_TYPES.includes(type)))],
    favorite: Boolean(raw.favorite),
    mainModel: Boolean(raw.mainModel),
    dna: raw.dna ?? null,
    origin: raw.origin ?? null,
  };
}

function sanitizeSnapshot(raw: unknown): MetricSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const { day, metrics } = raw as Partial<MetricSnapshot>;
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return null;
  const clean = emptyPerformance();
  for (const key of PERFORMANCE_KEYS) clean[key] = sanitizePerformanceValue(key, metrics?.[key]);
  return hasAnyMetric(clean) ? { day, metrics: clean } : null;
}

/** One snapshot per day, oldest first. Records saved before the history existed start from their current numbers. */
function sanitizeHistory(raw: Partial<ContentRecordInput>, metrics: PerformanceMetrics): MetricSnapshot[] {
  const byDay = new Map<string, MetricSnapshot>();
  for (const entry of Array.isArray(raw.metricsHistory) ? raw.metricsHistory : []) {
    const snapshot = sanitizeSnapshot(entry);
    if (snapshot) byDay.set(snapshot.day, snapshot);
  }
  if (byDay.size === 0 && hasAnyMetric(metrics)) {
    const day = (typeof raw.metricsUpdatedAt === 'string' ? raw.metricsUpdatedAt.slice(0, 10) : null) ?? (typeof raw.publishedAt === 'string' ? raw.publishedAt : null);
    if (day && ISO_DAY.test(day)) byDay.set(day, { day, metrics: { ...metrics } });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_SNAPSHOTS);
}

/**
 * Saves the numbers read on a day: replaces that day's snapshot, or adds a new one.
 * The current numbers follow the latest day, so a late entry for an older day never hides newer ones.
 */
export function withMeasurement(input: ContentRecordInput, day: string, metrics: PerformanceMetrics, now = new Date()): ContentRecordInput {
  const history = [...input.metricsHistory.filter((snapshot) => snapshot.day !== day), { day, metrics }].sort((a, b) => a.day.localeCompare(b.day));
  return { ...input, metricsHistory: history, metrics: { ...history[history.length - 1].metrics }, metricsUpdatedAt: now.toISOString() };
}

/** Drops one day; the current numbers fall back to the latest day left, or to "not measured". */
export function withoutMeasurement(input: ContentRecordInput, day: string): ContentRecordInput {
  const history = input.metricsHistory.filter((snapshot) => snapshot.day !== day);
  const latest = history[history.length - 1];
  return { ...input, metricsHistory: history, metrics: latest ? { ...latest.metrics } : emptyPerformance(), metricsUpdatedAt: latest ? input.metricsUpdatedAt : null };
}

export function toRecordInput(record: ContentRecord): ContentRecordInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = record;
  return input;
}

export function normalizeRecord(record: ContentRecord): ContentRecord {
  return { ...sanitizeRecordInput(record), id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

/** Day used for period filters and "most recent": the publication day, or the day it was registered. */
export function recordDay(record: Pick<ContentRecord, 'publishedAt' | 'createdAt'>): string {
  return record.publishedAt ?? record.createdAt.slice(0, 10);
}

/** Bottom of the funnel: sign-ups when measured, otherwise sales, otherwise leads. */
export function conversions(metrics: PerformanceMetrics): number | null {
  return metrics.signups ?? metrics.sales ?? metrics.leads;
}

/** Conversion Rate: sign-ups or sales over link clicks. */
export function conversionRate(metrics: PerformanceMetrics): number | null {
  const converted = conversions(metrics);
  return converted !== null && metrics.clicks ? converted / metrics.clicks : null;
}

/** Stable key to group by profile, registered or typed by hand. */
export function accountKey(record: Pick<ContentRecord, 'accountId' | 'accountLabel'>): string | null {
  if (record.accountId) return `id:${record.accountId}`;
  return record.accountLabel ? `label:${record.accountLabel.toLowerCase()}` : null;
}

export function formatMetric(key: PerformanceKey, value: number): string {
  if (key === 'revenue') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  return value.toLocaleString('pt-BR');
}

export function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: value < 0.01 ? 2 : 1 })}%`;
}
