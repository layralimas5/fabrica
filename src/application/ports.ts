import type { Analysis, AnalyzeRequest, CarouselDraft, DraftRequest, HooksRequest, MatchRequest, RemixAiRequest, RewriteRequest, SlideText, TagImageRequest } from '../domain/aiContract';
import type { Account, AccountInput } from '../domain/account';
import type { Asset, AssetUpload } from '../domain/asset';
import type { Preset, PresetInput } from '../domain/preset';
import type { BrandKit, BrandKitInput } from '../domain/brandKit';
import type { Carousel, CarouselInput } from '../domain/carousel';
import type { ContentRecord, ContentRecordInput } from '../domain/winners/record';
import type { Experiment, ExperimentInput } from '../domain/experiments/experiment';
import type { CalendarEntry, CalendarEntryInput } from '../domain/calendar/calendar';
import type { RemixScript } from '../domain/winners/remix';
import type { Project, ProjectInput } from '../domain/project';
import type { Publication, PublicationInput } from '../domain/social/publication';
import type { ContentVersion, ContentVersionInput } from '../domain/contentVersion';
import type { SocialConfig, SocialConnection, SyncRun } from '../domain/social/connection';
import type { AccountSnapshot, PostSnapshot } from '../domain/social/metrics';
import type { SocialPlatform } from '../domain/social/publication';
import type { TrackingEvent, TrackingLink, TrackingLinkInput } from '../domain/tracking/tracking';
import type { AiInsight, AiInsightInput } from '../domain/intelligence/insight';
import type { PublishingJob } from '../domain/publishing/job';

export interface User {
  id: string;
  email: string;
}

export interface AuthService {
  /** 'local': no login, everything saved in this browser. */
  readonly mode: 'supabase' | 'local';
  currentUser(): Promise<User | null>;
  /** Token that proves the session to the Fábrica's own functions; null in local mode. */
  accessToken(): Promise<string | null>;
  onChange(listener: (user: User | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

export interface BrandKitRepository {
  list(): Promise<BrandKit[]>;
  create(input: BrandKitInput): Promise<BrandKit>;
  update(id: string, input: BrandKitInput): Promise<BrandKit>;
  remove(id: string): Promise<void>;
}

export interface AssetRepository {
  list(): Promise<Asset[]>;
  upload(upload: AssetUpload): Promise<Asset>;
  update(id: string, patch: Pick<Asset, 'tags' | 'folder' | 'kind' | 'name'>): Promise<Asset>;
  /** Moves every asset of a folder to a new folder name (merging if it already exists). */
  renameFolder(from: string, to: string): Promise<void>;
  remove(id: string): Promise<void>;
  fetchBlob(asset: Asset): Promise<Blob>;
}

export interface AccountRepository {
  list(): Promise<Account[]>;
  create(input: AccountInput): Promise<Account>;
  update(id: string, input: AccountInput): Promise<Account>;
  remove(id: string): Promise<void>;
}

export interface PresetRepository {
  list(): Promise<Preset[]>;
  create(input: PresetInput): Promise<Preset>;
  update(id: string, input: PresetInput): Promise<Preset>;
  remove(id: string): Promise<void>;
}

export interface BackupSummary {
  presets: number;
  accounts: number;
  brandKits: number;
  assets: number;
  carousels: number;
  contentRecords: number;
  experiments: number;
  calendarEntries: number;
  projects: number;
  publications: number;
  /** Photos the server kept refusing; restoring the same file again sends only what is missing. */
  failedAssets?: string[];
}

/** Everything saved to one file that restores in either mode: the way to move from this browser to an account with login. */
export interface BackupService {
  exportAll(): Promise<Blob>;
  /** Adds what is in the file; items with the same id are replaced by the backup version. */
  importAll(file: Blob): Promise<BackupSummary>;
  /** When the last backup was downloaded (ISO), kept with the user so the monthly reminder knows. */
  lastBackupAt(): Promise<string | null>;
}

export interface CarouselRepository {
  list(): Promise<Carousel[]>;
  get(id: string): Promise<Carousel | null>;
  create(input: CarouselInput): Promise<Carousel>;
  update(id: string, input: CarouselInput): Promise<Carousel>;
  remove(id: string): Promise<void>;
}

/** Published contents with their results; the winners are the ones marked by hand. */
export interface ContentRecordRepository {
  list(): Promise<ContentRecord[]>;
  create(input: ContentRecordInput): Promise<ContentRecord>;
  update(id: string, input: ContentRecordInput): Promise<ContentRecord>;
  remove(id: string): Promise<void>;
}

/** Same four operations for every simple collection. */
export interface Repository<T, Input> {
  list(): Promise<T[]>;
  create(input: Input): Promise<T>;
  update(id: string, input: Input): Promise<T>;
  remove(id: string): Promise<void>;
}

export type ExperimentRepository = Repository<Experiment, ExperimentInput>;
export type CalendarEntryRepository = Repository<CalendarEntry, CalendarEntryInput>;
export type ProjectRepository = Repository<Project, ProjectInput>;
export type InsightRepository = Repository<AiInsight, AiInsightInput>;
/** Posts live on the networks, from a sync or linked by hand to a content of the Fábrica. */
export type PublicationRepository = Repository<Publication, PublicationInput>;

/** Saved copies of a carousel. A version never changes after it is saved. */
export interface ContentVersionRepository {
  listFor(carouselId: string): Promise<ContentVersion[]>;
  create(input: ContentVersionInput): Promise<ContentVersion>;
  remove(id: string): Promise<void>;
}

/**
 * Accounts connected through the official logins of the networks, and what their syncs read.
 * Needs the Supabase mode: in local mode `available` is false and every call explains why.
 */
export interface SocialService {
  readonly available: boolean;
  config(): Promise<SocialConfig>;
  listConnections(): Promise<SocialConnection[]>;
  /** URL of the network's authorization screen. */
  startConnection(platform: SocialPlatform, projectId: string | null): Promise<string>;
  disconnect(connectionId: string, deleteData: boolean): Promise<void>;
  sync(connectionId: string): Promise<{ status: SyncRun['status']; publications: number; error: string | null }>;
  updateLinks(connectionId: string, links: { accountId: string | null; projectId: string | null }): Promise<void>;
  listRuns(limit: number): Promise<SyncRun[]>;
  postSnapshots(sinceDay: string): Promise<PostSnapshot[]>;
  accountSnapshots(sinceDay: string): Promise<AccountSnapshot[]>;
}

/**
 * Tracked links (both modes) and the events of the landing pages and apps (Supabase mode only: events arrive
 * at the server function `track`, never in the browser that is reading them).
 */
export interface TrackingService {
  /** False in local mode: short links and events need the server. */
  readonly available: boolean;
  /** Base of the short links (/l/<slug>), the Fábrica's own address. */
  readonly shortLinkBase: string;
  /** URL the snippet sends events to, or null in local mode. */
  readonly endpoint: string | null;
  listLinks(): Promise<TrackingLink[]>;
  createLink(input: TrackingLinkInput): Promise<TrackingLink>;
  removeLink(id: string): Promise<void>;
  listEvents(sinceDay: string): Promise<TrackingEvent[]>;
  /** New server secret of a project, returned once (only its hash is stored). */
  rotateSecret(projectId: string): Promise<string>;
  /** Deletes every event of a project (data deletion request). */
  deleteEvents(projectId: string): Promise<void>;
}

export interface NewJob {
  connectionId: string;
  carouselId: string;
  /** ISO date-time. */
  scheduledAt: string;
  caption: string;
  title: string;
}

/**
 * Queue of posts to publish through the official APIs. A job is born waiting for approval; approving uploads the
 * rendered slides and schedules it; only the server publishes, with retries and a log of the result.
 */
export interface PublishingService {
  readonly available: boolean;
  listJobs(): Promise<PublishingJob[]>;
  createJob(input: NewJob): Promise<PublishingJob>;
  approve(job: PublishingJob, images: Blob[]): Promise<PublishingJob>;
  cancel(jobId: string): Promise<PublishingJob>;
  retry(jobId: string): Promise<PublishingJob>;
  /** Asks the worker to publish the user's jobs that are already due, without waiting for the schedule. */
  processNow(): Promise<{ processed: number }>;
}

export interface AiService {
  readonly engine: 'claude' | 'heuristic';
  draftCarousel(request: DraftRequest): Promise<CarouselDraft>;
  rewriteSlide(request: RewriteRequest): Promise<SlideText>;
  generateHooks(request: HooksRequest): Promise<string[]>;
  /** Tags describing what a photo shows and which themes it illustrates. */
  tagImage(request: TagImageRequest): Promise<string[]>;
  /** True when tagging a photo is quick right now (no model download pending). */
  visionReady(): boolean;
  /** One photo id per slide, or null when no photo in the library fits that slide. */
  matchImages(request: MatchRequest): Promise<(string | null)[]>;
  /** New contents that reuse a winner's mechanism. Only the Claude engine writes; the local one throws. */
  remixContent(request: RemixAiRequest): Promise<RemixScript[]>;
  /** Reading of measured results. Only the Claude engine writes it; the local one throws and the screen offers the briefing. */
  analyzeResults(request: AnalyzeRequest): Promise<Analysis>;
}

export interface Services {
  auth: AuthService;
  brandKits: BrandKitRepository;
  assets: AssetRepository;
  carousels: CarouselRepository;
  accounts: AccountRepository;
  presets: PresetRepository;
  contentRecords: ContentRecordRepository;
  experiments: ExperimentRepository;
  calendarEntries: CalendarEntryRepository;
  projects: ProjectRepository;
  publications: PublicationRepository;
  contentVersions: ContentVersionRepository;
  social: SocialService;
  tracking: TrackingService;
  insights: InsightRepository;
  publishing: PublishingService;
  ai: AiService;
  backup: BackupService | null;
}
