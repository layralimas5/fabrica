import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import type { AssetRepository, AuthService, BrandKitRepository, CarouselRepository, User } from '../../application/ports';
import type { Asset, AssetUpload } from '../../domain/asset';
import type { BrandKit, BrandKitInput } from '../../domain/brandKit';
import type { Carousel, CarouselInput } from '../../domain/carousel';
import { readImageSize } from '../imageSize';

const BUCKET = 'assets';

function fail(action: string, error: { message: string } | null): never {
  throw new Error(`${action}: ${error?.message ?? 'erro desconhecido'}`);
}

const toUser = (user: SupabaseUser | null | undefined): User | null => (user ? { id: user.id, email: user.email ?? '' } : null);

export class SupabaseAuth implements AuthService {
  readonly mode = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  async currentUser(): Promise<User | null> {
    const { data } = await this.client.auth.getSession();
    return toUser(data.session?.user);
  }

  onChange(listener: (user: User | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) fail('Não consegui entrar', error);
  }

  async signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) fail('Não consegui criar a conta', error);
    return { needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) fail('Não consegui sair', error);
  }
}

interface BrandKitRow {
  id: string;
  name: string;
  data: Omit<BrandKitInput, 'name'>;
  created_at: string;
  updated_at: string;
}

const rowToBrandKit = (row: BrandKitRow): BrandKit => ({ ...row.data, id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at });

export class SupabaseBrandKits implements BrandKitRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<BrandKit[]> {
    const { data, error } = await this.client.from('brand_kits').select('*').order('created_at');
    if (error) fail('Não consegui carregar as marcas', error);
    return (data as BrandKitRow[]).map(rowToBrandKit);
  }

  async create(input: BrandKitInput): Promise<BrandKit> {
    const { name, ...rest } = input;
    const { data, error } = await this.client.from('brand_kits').insert({ name, data: rest }).select().single();
    if (error) fail('Não consegui criar a marca', error);
    return rowToBrandKit(data as BrandKitRow);
  }

  async update(id: string, input: BrandKitInput): Promise<BrandKit> {
    const { name, ...rest } = input;
    const { data, error } = await this.client.from('brand_kits').update({ name, data: rest }).eq('id', id).select().single();
    if (error) fail('Não consegui salvar a marca', error);
    return rowToBrandKit(data as BrandKitRow);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('brand_kits').delete().eq('id', id);
    if (error) fail('Não consegui excluir a marca', error);
  }
}

interface AssetRow {
  id: string;
  name: string;
  folder: string;
  kind: Asset['kind'];
  tags: string[];
  width: number;
  height: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
}

const rowToAsset = (row: AssetRow): Asset => ({
  id: row.id,
  name: row.name,
  folder: row.folder,
  kind: row.kind,
  tags: row.tags,
  width: row.width,
  height: row.height,
  mimeType: row.mime_type,
  createdAt: row.created_at,
});

export class SupabaseAssets implements AssetRepository {
  private readonly paths = new Map<string, string>();

  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Asset[]> {
    const { data, error } = await this.client.from('assets').select('*').order('created_at', { ascending: false });
    if (error) fail('Não consegui carregar a biblioteca', error);
    return (data as AssetRow[]).map((row) => {
      this.paths.set(row.id, row.storage_path);
      return rowToAsset(row);
    });
  }

  async upload({ file, folder, kind, tags }: AssetUpload): Promise<Asset> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Sessão expirada. Entra de novo.');
    const size = await readImageSize(file);
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await this.client.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type });
    if (uploadError) fail(`Não consegui enviar ${file.name}`, uploadError);

    const { data, error } = await this.client
      .from('assets')
      .insert({ name: file.name, folder, kind, tags, width: size.width, height: size.height, mime_type: file.type, storage_path: storagePath })
      .select()
      .single();
    if (error) {
      await this.client.storage.from(BUCKET).remove([storagePath]);
      fail(`Não consegui registrar ${file.name}`, error);
    }
    const row = data as AssetRow;
    this.paths.set(row.id, row.storage_path);
    return rowToAsset(row);
  }

  async update(id: string, patch: Pick<Asset, 'tags' | 'folder' | 'kind' | 'name'>): Promise<Asset> {
    const { data, error } = await this.client.from('assets').update(patch).eq('id', id).select().single();
    if (error) fail('Não consegui salvar a imagem', error);
    return rowToAsset(data as AssetRow);
  }

  async remove(id: string): Promise<void> {
    const path = await this.pathOf(id);
    const { error } = await this.client.from('assets').delete().eq('id', id);
    if (error) fail('Não consegui excluir a imagem', error);
    const { error: storageError } = await this.client.storage.from(BUCKET).remove([path]);
    if (storageError) console.warn('Arquivo ficou órfão no storage:', storageError.message);
  }

  async fetchBlob(asset: Asset): Promise<Blob> {
    const { data, error } = await this.client.storage.from(BUCKET).download(await this.pathOf(asset.id));
    if (error) fail(`Não consegui baixar ${asset.name}`, error);
    return data;
  }

  private async pathOf(id: string): Promise<string> {
    const cached = this.paths.get(id);
    if (cached) return cached;
    const { data, error } = await this.client.from('assets').select('storage_path').eq('id', id).single();
    if (error) fail('Imagem não encontrada', error);
    const path = (data as { storage_path: string }).storage_path;
    this.paths.set(id, path);
    return path;
  }
}

interface CarouselRow {
  id: string;
  brand_kit_id: string;
  title: string;
  status: Carousel['status'];
  format: Carousel['format'];
  source: Carousel['source'];
  slides: Carousel['slides'];
  created_at: string;
  updated_at: string;
}

const rowToCarousel = (row: CarouselRow): Carousel => ({
  id: row.id,
  brandKitId: row.brand_kit_id,
  title: row.title,
  status: row.status,
  format: row.format,
  source: row.source,
  slides: row.slides,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const carouselToRow = (input: CarouselInput) => ({
  brand_kit_id: input.brandKitId,
  title: input.title,
  status: input.status,
  format: input.format,
  source: input.source,
  slides: input.slides,
});

export class SupabaseCarousels implements CarouselRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Carousel[]> {
    const { data, error } = await this.client.from('carousels').select('*').order('updated_at', { ascending: false });
    if (error) fail('Não consegui carregar os projetos', error);
    return (data as CarouselRow[]).map(rowToCarousel);
  }

  async get(id: string): Promise<Carousel | null> {
    const { data, error } = await this.client.from('carousels').select('*').eq('id', id).maybeSingle();
    if (error) fail('Não consegui abrir o carrossel', error);
    return data ? rowToCarousel(data as CarouselRow) : null;
  }

  async create(input: CarouselInput): Promise<Carousel> {
    const { data, error } = await this.client.from('carousels').insert(carouselToRow(input)).select().single();
    if (error) fail('Não consegui salvar o carrossel', error);
    return rowToCarousel(data as CarouselRow);
  }

  async update(id: string, input: CarouselInput): Promise<Carousel> {
    const { data, error } = await this.client.from('carousels').update(carouselToRow(input)).eq('id', id).select().single();
    if (error) fail('Não consegui salvar o carrossel', error);
    return rowToCarousel(data as CarouselRow);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('carousels').delete().eq('id', id);
    if (error) fail('Não consegui excluir o carrossel', error);
  }
}
