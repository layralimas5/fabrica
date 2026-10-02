import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type {
  AccountRepository,
  AssetRepository,
  AuthService,
  BackupService,
  BackupSummary,
  BrandKitRepository,
  CarouselRepository,
  PresetRepository,
  User,
} from '../../application/ports';
import { normalizeSettings, type Preset, type PresetInput } from '../../domain/preset';
import type { Account, AccountInput } from '../../domain/account';
import type { Asset, AssetUpload } from '../../domain/asset';
import type { BrandKit, BrandKitInput } from '../../domain/brandKit';
import { normalizeCarousel, type Carousel, type CarouselInput } from '../../domain/carousel';
import { readImageSize } from '../imageSize';

const store: UseStore = createStore('fabrica-carrosseis-demo', 'kv');
const SESSION_KEY = 'session';

const now = () => new Date().toISOString();

const LOCAL_USER: User = { id: 'local', email: 'Neste computador' };

/**
 * Local mode has no login: the first visit opens a local session and keeps it.
 * A session created by the old e-mail screen is kept, so data saved before stays visible.
 */
export class DemoAuth implements AuthService {
  readonly mode = 'local' as const;
  private readonly listeners = new Set<(user: User | null) => void>();

  async currentUser(): Promise<User | null> {
    const existing = await get<User>(SESSION_KEY, store);
    if (existing) return existing;
    await set(SESSION_KEY, LOCAL_USER, store);
    return LOCAL_USER;
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

  async renameFolder(from: string, to: string): Promise<void> {
    const assets = await this.list();
    await writeCollection('assets', assets.map((asset) => (asset.folder === from ? { ...asset, folder: to } : asset)));
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
    const items = (await readCollection<Carousel>('carousels')).map(normalizeCarousel);
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

export class DemoAccounts implements AccountRepository {
  list(): Promise<Account[]> {
    return readCollection<Account>('accounts');
  }

  async create(input: AccountInput): Promise<Account> {
    const account: Account = { ...input, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    await writeCollection('accounts', [...(await this.list()), account]);
    return account;
  }

  async update(id: string, input: AccountInput): Promise<Account> {
    const accounts = await this.list();
    const updated: Account = { ...requireItem(accounts, id, 'Conta'), ...input, updatedAt: now() };
    await writeCollection('accounts', accounts.map((account) => (account.id === id ? updated : account)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('accounts', (await this.list()).filter((account) => account.id !== id));
  }
}

const BACKUP_APP = 'fabrica';
const BACKUP_VERSION = 1;

interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  accounts: Account[];
  /** Missing in backups made before presets existed. */
  presets?: Preset[];
  brandKits: BrandKit[];
  assets: Asset[];
  carousels: Carousel[];
  /** Image files by asset id, as data URLs. */
  files: Record<string, string>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Não consegui ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<BackupFile>;
  return file.app === BACKUP_APP && Array.isArray(file.accounts) && Array.isArray(file.brandKits) && Array.isArray(file.assets) && Array.isArray(file.carousels) && typeof file.files === 'object';
}

/** Replaces items with the same id and keeps the rest. */
function upsertById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const ids = new Set(incoming.map((item) => item.id));
  return [...current.filter((item) => !ids.has(item.id)), ...incoming];
}

export class LocalBackup implements BackupService {
  async exportAll(): Promise<Blob> {
    const assets = await readCollection<Asset>('assets');
    const files: Record<string, string> = {};
    for (const asset of assets) {
      const blob = await get<Blob>(await scopedKey(`blob:${asset.id}`), store);
      if (blob) files[asset.id] = await blobToDataUrl(blob);
    }
    const backup: BackupFile = {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: now(),
      accounts: await readCollection<Account>('accounts'),
      presets: await readCollection<Preset>('presets'),
      brandKits: await readCollection<BrandKit>('brandKits'),
      assets,
      carousels: await readCollection<Carousel>('carousels'),
      files,
    };
    return new Blob([JSON.stringify(backup)], { type: 'application/json' });
  }

  async importAll(file: Blob): Promise<BackupSummary> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('Esse arquivo não é um backup da Fábrica.');
    }
    if (!isBackupFile(parsed)) throw new Error('Esse arquivo não é um backup da Fábrica.');

    for (const [assetId, dataUrl] of Object.entries(parsed.files)) {
      await set(await scopedKey(`blob:${assetId}`), await dataUrlToBlob(dataUrl), store);
    }
    const restoredAssets = parsed.assets.filter((asset) => asset.id in parsed.files);
    await writeCollection('assets', upsertById(await readCollection<Asset>('assets'), restoredAssets));
    await writeCollection('accounts', upsertById(await readCollection<Account>('accounts'), parsed.accounts));
    await writeCollection('brandKits', upsertById(await readCollection<BrandKit>('brandKits'), parsed.brandKits));
    await writeCollection('carousels', upsertById(await readCollection<Carousel>('carousels'), parsed.carousels));
    const presets = parsed.presets ?? [];
    await writeCollection('presets', upsertById(await readCollection<Preset>('presets'), presets));
    return { presets: presets.length, accounts: parsed.accounts.length, brandKits: parsed.brandKits.length, assets: restoredAssets.length, carousels: parsed.carousels.length };
  }
}

export class DemoPresets implements PresetRepository {
  async list(): Promise<Preset[]> {
    return (await readCollection<Preset>('presets')).map((preset) => ({ ...preset, settings: normalizeSettings(preset.settings) }));
  }

  async create(input: PresetInput): Promise<Preset> {
    const preset: Preset = { ...input, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    await writeCollection('presets', [...(await readCollection<Preset>('presets')), preset]);
    return preset;
  }

  async update(id: string, input: PresetInput): Promise<Preset> {
    const presets = await readCollection<Preset>('presets');
    const updated: Preset = { ...requireItem(presets, id, 'Predefinição'), ...input, updatedAt: now() };
    await writeCollection('presets', presets.map((preset) => (preset.id === id ? updated : preset)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('presets', (await readCollection<Preset>('presets')).filter((preset) => preset.id !== id));
  }
}
