import type { CarouselDraft, DraftRequest, HooksRequest, MatchRequest, RemixAiRequest, RewriteRequest, SlideText, TagImageRequest } from '../domain/aiContract';
import type { Account, AccountInput } from '../domain/account';
import type { Asset, AssetUpload } from '../domain/asset';
import type { Preset, PresetInput } from '../domain/preset';
import type { BrandKit, BrandKitInput } from '../domain/brandKit';
import type { Carousel, CarouselInput } from '../domain/carousel';
import type { ContentRecord, ContentRecordInput } from '../domain/winners/record';
import type { RemixScript } from '../domain/winners/remix';

export interface User {
  id: string;
  email: string;
}

export interface AuthService {
  /** 'local': no login, everything saved in this browser. */
  readonly mode: 'supabase' | 'local';
  currentUser(): Promise<User | null>;
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
}

/** Local mode only: everything lives in this browser, so it can be saved to a file and restored anywhere. */
export interface BackupService {
  exportAll(): Promise<Blob>;
  /** Adds what is in the file; items with the same id are replaced by the backup version. */
  importAll(file: Blob): Promise<BackupSummary>;
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
}

export interface Services {
  auth: AuthService;
  brandKits: BrandKitRepository;
  assets: AssetRepository;
  carousels: CarouselRepository;
  accounts: AccountRepository;
  presets: PresetRepository;
  contentRecords: ContentRecordRepository;
  ai: AiService;
  backup: BackupService | null;
}
