import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type {
  AccountRepository,
  AssetRepository,
  AuthService,
  BackupService,
  BackupSummary,
  BrandKitRepository,
  CarouselRepository,
  ContentRecordRepository,
  Repository,
  PresetRepository,
  User,
} from '../../application/ports';
import { normalizeSettings, type Preset, type PresetInput } from '../../domain/preset';
import { normalizeAccount, type Account, type AccountInput } from '../../domain/account';
import type { Asset, AssetUpload } from '../../domain/asset';
import type { BrandKit, BrandKitInput } from '../../domain/brandKit';
import { normalizeCarousel, type Carousel, type CarouselInput } from '../../domain/carousel';
import { normalizeRecord, sanitizeRecordInput, type ContentRecord, type ContentRecordInput } from '../../domain/winners/record';
import { sanitizeExperimentInput, type Experiment, type ExperimentInput } from '../../domain/experiments/experiment';
import { sanitizeEntryInput, type CalendarEntry, type CalendarEntryInput } from '../../domain/calendar/calendar';
import { blobToDataUrl, buildBackup, dataUrlToBlob, readBackup, summarize } from '../backupFile';
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
  async list(): Promise<Account[]> {
    return (await readCollection<Account>('accounts')).map(normalizeAccount);
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
    return buildBackup({
      accounts: await readCollection<Account>('accounts'),
      presets: await readCollection<Preset>('presets'),
      brandKits: await readCollection<BrandKit>('brandKits'),
      assets,
      carousels: await readCollection<Carousel>('carousels'),
      contentRecords: await readCollection<ContentRecord>('contentRecords'),
      experiments: await readCollection<Experiment>('experiments'),
      calendarEntries: await readCollection<CalendarEntry>('calendarEntries'),
      files,
    });
  }

  async importAll(file: Blob): Promise<BackupSummary> {
    const data = await readBackup(file);
    for (const asset of data.assets) {
      await set(await scopedKey(`blob:${asset.id}`), await dataUrlToBlob(data.files[asset.id]), store);
    }
    await writeCollection('assets', upsertById(await readCollection<Asset>('assets'), data.assets));
    await writeCollection('accounts', upsertById(await readCollection<Account>('accounts'), data.accounts));
    await writeCollection('brandKits', upsertById(await readCollection<BrandKit>('brandKits'), data.brandKits));
    await writeCollection('carousels', upsertById(await readCollection<Carousel>('carousels'), data.carousels));
    await writeCollection('presets', upsertById(await readCollection<Preset>('presets'), data.presets));
    await writeCollection('contentRecords', upsertById(await readCollection<ContentRecord>('contentRecords'), data.contentRecords));
    await writeCollection('experiments', upsertById(await readCollection<Experiment>('experiments'), data.experiments));
    await writeCollection('calendarEntries', upsertById(await readCollection<CalendarEntry>('calendarEntries'), data.calendarEntries));
    return summarize(data);
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

export class DemoContentRecords implements ContentRecordRepository {
  async list(): Promise<ContentRecord[]> {
    return (await readCollection<ContentRecord>('contentRecords')).map(normalizeRecord);
  }

  async create(input: ContentRecordInput): Promise<ContentRecord> {
    const record: ContentRecord = { ...sanitizeRecordInput(input), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    await writeCollection('contentRecords', [record, ...(await readCollection<ContentRecord>('contentRecords'))]);
    return record;
  }

  async update(id: string, input: ContentRecordInput): Promise<ContentRecord> {
    const records = await readCollection<ContentRecord>('contentRecords');
    const updated: ContentRecord = { ...requireItem(records, id, 'Conteúdo'), ...sanitizeRecordInput(input), updatedAt: now() };
    await writeCollection('contentRecords', records.map((record) => (record.id === id ? updated : record)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection('contentRecords', (await readCollection<ContentRecord>('contentRecords')).filter((record) => record.id !== id));
  }
}

/** A simple collection kept in this browser: every input goes through the domain sanitizer. */
class DemoCollection<T extends { id: string; createdAt: string; updatedAt: string }, Input> implements Repository<T, Input> {
  constructor(
    private readonly collection: string,
    private readonly label: string,
    private readonly sanitize: (input: Partial<Input>) => Input,
  ) {}

  async list(): Promise<T[]> {
    return (await readCollection<T>(this.collection)).map((item) => ({ ...item, ...this.sanitize(item as unknown as Partial<Input>) }));
  }

  async create(input: Input): Promise<T> {
    const item = { ...this.sanitize(input), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() } as unknown as T;
    await writeCollection(this.collection, [item, ...(await readCollection<T>(this.collection))]);
    return item;
  }

  async update(id: string, input: Input): Promise<T> {
    const items = await readCollection<T>(this.collection);
    const updated = { ...requireItem(items, id, this.label), ...this.sanitize(input), updatedAt: now() } as T;
    await writeCollection(this.collection, items.map((item) => (item.id === id ? updated : item)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await writeCollection(this.collection, (await readCollection<T>(this.collection)).filter((item) => item.id !== id));
  }
}

export const demoExperiments = () => new DemoCollection<Experiment, ExperimentInput>('experiments', 'Experimento', sanitizeExperimentInput);
export const demoCalendarEntries = () => new DemoCollection<CalendarEntry, CalendarEntryInput>('calendarEntries', 'Conteúdo do calendário', sanitizeEntryInput);
