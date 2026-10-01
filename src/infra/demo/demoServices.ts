import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { AssetRepository, AuthService, BrandKitRepository, CarouselRepository, User } from '../../application/ports';
import type { Asset, AssetUpload } from '../../domain/asset';
import type { BrandKit, BrandKitInput } from '../../domain/brandKit';
import type { Carousel, CarouselInput } from '../../domain/carousel';
import { readImageSize } from '../imageSize';

const store: UseStore = createStore('fabrica-carrosseis-demo', 'kv');
const SESSION_KEY = 'session';

const now = () => new Date().toISOString();

/** Local-only auth for demo mode: any e-mail works, data stays in this browser. */
export class DemoAuth implements AuthService {
  readonly mode = 'demo' as const;
  private readonly listeners = new Set<(user: User | null) => void>();

  async currentUser(): Promise<User | null> {
    return (await get<User>(SESSION_KEY, store)) ?? null;
  }

  onChange(listener: (user: User | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    if (!email.includes('@')) throw new Error('Informa um e-mail válido.');
    if (password.length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.');
    const user: User = { id: `demo-${email.toLowerCase()}`, email: email.toLowerCase() };
    await set(SESSION_KEY, user, store);
    this.emit(user);
  }

  async signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    await this.signInWithPassword(email, password);
    return { needsConfirmation: false };
  }

  async signOut(): Promise<void> {
    await del(SESSION_KEY, store);
    this.emit(null);
  }

  private emit(user: User | null): void {
    this.listeners.forEach((listener) => listener(user));
  }
}

/** Collections are namespaced by the signed-in demo user so two e-mails never see each other's data. */
async function scopedKey(collection: string): Promise<string> {
  const user = await get<User>(SESSION_KEY, store);
  if (!user) throw new Error('Sessão expirada. Entra de novo.');
  return `${user.id}:${collection}`;
}

async function readCollection<T>(collection: string): Promise<T[]> {
  return (await get<T[]>(await scopedKey(collection), store)) ?? [];
}

async function writeCollection<T>(collection: string, items: T[]): Promise<void> {
  await set(await scopedKey(collection), items, store);
}

function requireItem<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`${label} não encontrado.`);
  return item;
}

export class DemoBrandKits implements BrandKitRepository {
  list(): Promise<BrandKit[]> {
    return readCollection<BrandKit>('brandKits');
  }

  async create(input: BrandKitInput): Promise<BrandKit> {
    const kit: BrandKit = { ...input, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    await writeCollection('brandKits', [...(await this.list()), kit]);
    return kit;
  }

  async update(id: string, input: BrandKitInput): Promise<BrandKit> {
    const kits = await this.list();
    const updated: BrandKit = { ...requireItem(kits, id, 'Marca'), ...input, updatedAt: now() };
    await writeCollection('brandKits', kits.map((kit) => (kit.id === id ? updated : kit)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('brandKits', (await this.list()).filter((kit) => kit.id !== id));
  }
}

export class DemoAssets implements AssetRepository {
  list(): Promise<Asset[]> {
    return readCollection<Asset>('assets');
  }

  async upload({ file, folder, kind, tags }: AssetUpload): Promise<Asset> {
    const size = await readImageSize(file);
    const asset: Asset = { id: crypto.randomUUID(), name: file.name, folder, kind, tags, width: size.width, height: size.height, mimeType: file.type, createdAt: now() };
    await set(await scopedKey(`blob:${asset.id}`), file, store);
    await writeCollection('assets', [asset, ...(await this.list())]);
    return asset;
  }

  async update(id: string, patch: Pick<Asset, 'tags' | 'folder' | 'kind' | 'name'>): Promise<Asset> {
    const assets = await this.list();
    const updated: Asset = { ...requireItem(assets, id, 'Imagem'), ...patch };
    await writeCollection('assets', assets.map((asset) => (asset.id === id ? updated : asset)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('assets', (await this.list()).filter((asset) => asset.id !== id));
    await del(await scopedKey(`blob:${id}`), store);
  }

  async fetchBlob(asset: Asset): Promise<Blob> {
    const blob = await get<Blob>(await scopedKey(`blob:${asset.id}`), store);
    if (!blob) throw new Error(`Arquivo de ${asset.name} não encontrado.`);
    return blob;
  }
}

export class DemoCarousels implements CarouselRepository {
  async list(): Promise<Carousel[]> {
    const items = await readCollection<Carousel>('carousels');
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Carousel | null> {
    return (await this.list()).find((carousel) => carousel.id === id) ?? null;
  }

  async create(input: CarouselInput): Promise<Carousel> {
    const carousel: Carousel = { ...input, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    await writeCollection('carousels', [carousel, ...(await this.list())]);
    return carousel;
  }

  async update(id: string, input: CarouselInput): Promise<Carousel> {
    const items = await this.list();
    const updated: Carousel = { ...requireItem(items, id, 'Carrossel'), ...input, updatedAt: now() };
    await writeCollection('carousels', items.map((item) => (item.id === id ? updated : item)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('carousels', (await this.list()).filter((item) => item.id !== id));
  }
}
