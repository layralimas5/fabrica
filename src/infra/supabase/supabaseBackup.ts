import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRepository, AssetRepository, BackupService, BackupSummary, BrandKitRepository, CarouselRepository, ContentRecordRepository, PresetRepository, Repository } from '../../application/ports';
import type { CalendarEntry, CalendarEntryInput } from '../../domain/calendar/calendar';
import type { Experiment, ExperimentInput } from '../../domain/experiments/experiment';
import { toCarouselInput } from '../../domain/carousel';
import { toRecordInput } from '../../domain/winners/record';
import { blobToDataUrl, buildBackup, dataUrlToBlob, readBackup, summarize } from '../backupFile';
import { BUCKET, carouselToRow, fail, recordToRow } from './supabaseServices';

interface SupabaseRepositories {
  accounts: AccountRepository;
  presets: PresetRepository;
  brandKits: BrandKitRepository;
  assets: AssetRepository;
  carousels: CarouselRepository;
  contentRecords: ContentRecordRepository;
  experiments: Repository<Experiment, ExperimentInput>;
  calendarEntries: Repository<CalendarEntry, CalendarEntryInput>;
}

const CHUNK = 100;
const UPLOAD_ATTEMPTS = 4;
const LAST_BACKUP_KEY = 'last_backup_at';

/**
 * Backup for the account with login. Restoring keeps every id, so carousels still point to their photos,
 * accounts and results: the way to bring what was made in local mode into Supabase.
 */
export class SupabaseBackup implements BackupService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly repositories: SupabaseRepositories,
  ) {}

  async exportAll(): Promise<Blob> {
    const { accounts, presets, brandKits, assets, carousels, contentRecords, experiments, calendarEntries } = this.repositories;
    const assetList = await assets.list();
    const files: Record<string, string> = {};
    for (const asset of assetList) files[asset.id] = await blobToDataUrl(await assets.fetchBlob(asset));
    const backup = buildBackup({
      accounts: await accounts.list(),
      presets: await presets.list(),
      brandKits: await brandKits.list(),
      assets: assetList,
      carousels: await carousels.list(),
      contentRecords: await contentRecords.list(),
      experiments: await experiments.list(),
      calendarEntries: await calendarEntries.list(),
      files,
    });
    const { error } = await this.client.auth.updateUser({ data: { [LAST_BACKUP_KEY]: new Date().toISOString() } });
    if (error) console.warn('Backup baixado, mas a data não foi guardada:', error.message);
    return backup;
  }

  /** Kept in the user's metadata, so it survives clearing the browser without a new table. */
  async lastBackupAt(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    const value: unknown = data.user?.user_metadata?.[LAST_BACKUP_KEY];
    return typeof value === 'string' ? value : null;
  }

  /** In dependency order: what a row points to is saved before the row. Restoring twice replaces, never duplicates. */
  async importAll(file: Blob): Promise<BackupSummary> {
    const data = await readBackup(file);
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Sessão expirada. Entra de novo.');
    const userId = auth.user.id;

    await this.upsert('accounts', 'as contas', data.accounts.map(({ id, name, createdAt, updatedAt: _u, ...rest }) => ({ id, name, data: rest, created_at: createdAt })));
    await this.upsert('brand_kits', 'as marcas', data.brandKits.map(({ id, name, createdAt, updatedAt: _u, ...rest }) => ({ id, name, data: rest, created_at: createdAt })));
    await this.upsert('presets', 'as predefinições', data.presets.map((preset) => ({ id: preset.id, name: preset.name, data: preset.settings, created_at: preset.createdAt })));

    const { data: stored, error: listError } = await this.client.from('assets').select('id');
    if (listError) fail('Não consegui ler as imagens que já estão na conta', listError);
    const already = new Set((stored as { id: string }[]).map((row) => row.id));
    const assetRows = [];
    const failedAssets: string[] = [];
    for (const asset of data.assets) {
      if (already.has(asset.id)) continue;
      const extension = asset.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const storagePath = `${userId}/${asset.id}.${extension}`;
      const uploaded = await this.uploadWithRetry(storagePath, await dataUrlToBlob(data.files[asset.id]), asset.mimeType);
      if (!uploaded) {
        failedAssets.push(asset.name);
        continue;
      }
      assetRows.push({ id: asset.id, name: asset.name, folder: asset.folder, kind: asset.kind, tags: asset.tags, width: asset.width, height: asset.height, mime_type: asset.mimeType, storage_path: storagePath, created_at: asset.createdAt });
    }
    await this.upsert('assets', 'as imagens', assetRows);

    await this.upsert('carousels', 'os carrosséis', data.carousels.map((carousel) => ({ id: carousel.id, ...carouselToRow(toCarouselInput(carousel)), created_at: carousel.createdAt })));
    // A result whose carousel was deleted keeps its numbers, without the link.
    const carouselIds = new Set(data.carousels.map((carousel) => carousel.id));
    const known = async (id: string | null) => (id && (carouselIds.has(id) || (await this.repositories.carousels.get(id))) ? id : null);
    const recordRows = [];
    for (const record of data.contentRecords) {
      const input = { ...toRecordInput(record), carouselId: await known(record.carouselId) };
      recordRows.push({ id: record.id, ...recordToRow(input), created_at: record.createdAt });
    }
    await this.upsert('content_records', 'os resultados', recordRows);
    await this.upsert('experiments', 'os experimentos', data.experiments.map(({ id, createdAt, updatedAt: _u, ...rest }) => ({ id, data: rest, created_at: createdAt })));
    await this.upsert('calendar_entries', 'o calendário', data.calendarEntries.map(({ id, createdAt, updatedAt: _u, ...rest }) => ({ id, date: rest.date, data: rest, created_at: createdAt })));
    return { ...summarize(data), assets: data.assets.length - failedAssets.length, failedAssets };
  }

  /** Storage sometimes times out (504) on one file; trying again a few seconds later usually works. */
  private async uploadWithRetry(path: string, blob: Blob, contentType: string): Promise<boolean> {
    for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true });
      if (!error) return true;
      console.warn(`Tentativa ${attempt + 1} de enviar ${path} falhou:`, error.message);
    }
    return false;
  }

  private async upsert(table: string, label: string, rows: Record<string, unknown>[]): Promise<void> {
    for (let start = 0; start < rows.length; start += CHUNK) {
      const { error } = await this.client.from(table).upsert(rows.slice(start, start + CHUNK), { onConflict: 'id' });
      if (error) fail(`Não consegui restaurar ${label}`, error);
    }
  }
}
