import type { CarouselDraft, DraftRequest, HooksRequest, RewriteRequest, SlideText } from '../domain/aiContract';
import type { Asset, AssetUpload } from '../domain/asset';
import type { BrandKit, BrandKitInput } from '../domain/brandKit';
import type { Carousel, CarouselInput } from '../domain/carousel';

export interface User {
  id: string;
  email: string;
}

export interface AuthService {
  readonly mode: 'supabase' | 'demo';
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

export interface CarouselRepository {
  list(): Promise<Carousel[]>;
  get(id: string): Promise<Carousel | null>;
  create(input: CarouselInput): Promise<Carousel>;
  update(id: string, input: CarouselInput): Promise<Carousel>;
  remove(id: string): Promise<void>;
}

export interface AiService {
  readonly engine: 'claude' | 'heuristic';
  draftCarousel(request: DraftRequest): Promise<CarouselDraft>;
  rewriteSlide(request: RewriteRequest): Promise<SlideText>;
  generateHooks(request: HooksRequest): Promise<string[]>;
}

export interface Services {
  auth: AuthService;
  brandKits: BrandKitRepository;
  assets: AssetRepository;
  carousels: CarouselRepository;
  ai: AiService;
}
