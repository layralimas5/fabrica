import type { Account } from '../account';
import { isPublished } from '../analytics/summary';
import type { AnalyticsItem } from '../analytics/items';
import type { Project } from '../project';
import type { SocialConnection } from '../social/connection';
import { POST_METRIC_KEYS, type PostMetricKey, type PostMetrics, type PostSnapshot } from '../social/metrics';
import { MEDIA_TYPE_LABELS, type MediaType, type Publication, type SocialPlatform } from '../social/publication';
import { classifyHook } from '../winners/dna';
import { CONTENT_FORMAT_LABELS, type ContentFormat, type ContentRecord, type HookType, type PerformanceMetrics } from '../winners/record';

/**
 * One published content as the Painel sees it. Numbers come from one source only:
 * the official API when the post was synced, otherwise what was typed by hand. Never both added together.
 */
export interface DashItem {
  key: string;
  title: string;
  caption: string;
  platform: DashPlatform;
  /** "acc:<id>" for accounts of the Fábrica, "conn:<id>" for a connected account not linked to one. */
  accountKey: string | null;
  project: string;
  format: string;
  formatLabel: string;
  publishedDay: string | null;
  source: 'api' | 'manual';
  /** One reading per day, oldest first. */
  history: { day: string; metrics: PostMetrics }[];
  metrics: PostMetrics;
  lastReadAt: string | null;
  carouselId: string | null;
  recordId: string | null;
  publicationId: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  /** Conversions typed by hand (clicks, sign-ups), shown apart from tracked events. */
  manualConversions: { clicks: number | null; signups: number | null } | null;
  /** What the content is (hook, CTA, theme), compared by the Inteligência. */
  facts: ContentFacts;
}

export interface ContentFacts {
  hook: string;
  hookType: HookType | null;
  cta: string;
  theme: string;
}

const firstLine = (text: string) => text.split('\n').find((line) => line.trim())?.trim().slice(0, 300) ?? '';

function factsOf(record: ContentRecord | null, caption: string): ContentFacts {
  const hook = record?.hook || firstLine(caption);
  return { hook, hookType: record?.hookType ?? (hook ? classifyHook(hook) : null), cta: record?.cta ?? '', theme: record?.theme ?? '' };
}

export type DashPlatform = SocialPlatform | 'outros';
export const DASH_PLATFORM_LABELS: Record<DashPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', outros: 'Outros' };

const FORMAT_TO_MEDIA: Partial<Record<ContentFormat, MediaType>> = { carrossel: 'carousel' };

export interface DashSources {
  analyticsItems: AnalyticsItem[];
  publications: Publication[];
  snapshots: PostSnapshot[];
  connections: SocialConnection[];
  accounts: Account[];
  projects: Project[];
}

function manualMetrics(metrics: PerformanceMetrics): PostMetrics {
  const result: PostMetrics = {};
  for (const key of ['views', 'likes', 'comments', 'shares', 'saves'] as const) {
    const value = metrics[key];
    if (value !== null) result[key] = value;
  }
  return result;
}

function hasAny(metrics: PostMetrics): boolean {
  return POST_METRIC_KEYS.some((key) => metrics[key] !== undefined);
}

export function buildDashItems({ analyticsItems, publications, snapshots, connections, accounts, projects }: DashSources): DashItem[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const byPublication = new Map<string, PostSnapshot[]>();
  for (const snapshot of snapshots) byPublication.set(snapshot.publicationId, [...(byPublication.get(snapshot.publicationId) ?? []), snapshot]);
  const contentOf = (publication: Publication) =>
    analyticsItems.find((item) => (publication.carouselId && item.carousel?.id === publication.carouselId) || (publication.recordId && !item.derived && item.record.id === publication.recordId)) ?? null;

  const covered = new Set<AnalyticsItem>();
  const items: DashItem[] = [];

  for (const publication of publications) {
    const readings = (byPublication.get(publication.id) ?? []).filter((snapshot) => hasAny(snapshot.metrics)).sort((a, b) => a.day.localeCompare(b.day));
    if (readings.length === 0) continue;
    const content = contentOf(publication);
    if (content) covered.add(content);
    const connection = publication.connectionId ? connectionById.get(publication.connectionId) : undefined;
    const accountId = connection?.accountId ?? content?.record.accountId ?? null;
    const account = accountId ? accountById.get(accountId) : undefined;
    const project = (connection?.projectId ? projectById.get(connection.projectId)?.name : undefined) ?? content?.carousel?.project ?? account?.project ?? '';
    const latest = readings[readings.length - 1];
    items.push({
      key: `pub:${publication.id}`,
      title: publication.title || content?.record.title || publication.caption.slice(0, 80) || 'Post sem legenda',
      caption: publication.caption || content?.record.caption || '',
      platform: publication.platform,
      accountKey: accountId ? `acc:${accountId}` : connection ? `conn:${connection.id}` : null,
      project,
      format: publication.mediaType,
      formatLabel: MEDIA_TYPE_LABELS[publication.mediaType],
      publishedDay: publication.publishedAt ? publication.publishedAt.slice(0, 10) : (content?.record.publishedAt ?? null),
      source: 'api',
      history: readings.map((snapshot) => ({ day: snapshot.day, metrics: snapshot.metrics })),
      metrics: latest.metrics,
      lastReadAt: latest.capturedAt,
      carouselId: publication.carouselId,
      recordId: publication.recordId,
      publicationId: publication.id,
      thumbnailUrl: publication.thumbnailUrl,
      permalink: publication.permalink,
      manualConversions: null,
      facts: factsOf(content?.record ?? null, publication.caption),
    });
  }

  for (const item of analyticsItems) {
    if (covered.has(item) || !isPublished(item)) continue;
    const { record, carousel } = item;
    const history = record.metricsHistory.map((snapshot) => ({ day: snapshot.day, metrics: manualMetrics(snapshot.metrics) })).filter((entry) => hasAny(entry.metrics));
    const account = record.accountId ? accountById.get(record.accountId) : undefined;
    const media = FORMAT_TO_MEDIA[record.format];
    const linked = publications.find((publication) => (carousel && publication.carouselId === carousel.id) || (!item.derived && publication.recordId === record.id));
    items.push({
      key: carousel ? `car:${carousel.id}` : `rec:${record.id}`,
      title: record.title || 'Sem título',
      caption: record.caption,
      platform: record.platform,
      accountKey: record.accountId ? `acc:${record.accountId}` : record.accountLabel ? `label:${record.accountLabel.toLowerCase()}` : null,
      project: carousel?.project || account?.project || '',
      format: media ?? record.format,
      formatLabel: media ? MEDIA_TYPE_LABELS[media] : CONTENT_FORMAT_LABELS[record.format],
      publishedDay: record.publishedAt,
      source: 'manual',
      history,
      metrics: manualMetrics(record.metrics),
      lastReadAt: record.metricsUpdatedAt,
      carouselId: carousel?.id ?? record.carouselId,
      recordId: item.derived ? null : record.id,
      publicationId: linked?.id ?? null,
      thumbnailUrl: linked?.thumbnailUrl ?? null,
      permalink: linked?.permalink ?? null,
      manualConversions: record.metrics.clicks !== null || record.metrics.signups !== null ? { clicks: record.metrics.clicks, signups: record.metrics.signups } : null,
      facts: factsOf(record, record.caption),
    });
  }
  return items;
}

/** Interactions over views of one content; null when views or every interaction are missing. */
export function itemEngagement(metrics: PostMetrics): number | null {
  if (!metrics.views) return null;
  const interactions = (['likes', 'comments', 'shares', 'saves'] as PostMetricKey[]).filter((key) => metrics[key] !== undefined);
  if (interactions.length === 0) return null;
  return interactions.reduce((sum, key) => sum + (metrics[key] ?? 0), 0) / metrics.views;
}
