import type { BackupSummary } from '../application/ports';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { CalendarEntry } from '../domain/calendar/calendar';
import type { Carousel } from '../domain/carousel';
import type { Experiment } from '../domain/experiments/experiment';
import type { Preset } from '../domain/preset';
import { normalizeRecord, type ContentRecord } from '../domain/winners/record';

/**
 * The backup file shared by both modes: a backup made in the browser restores on Supabase and the other way
 * around, so moving from local mode to an account with login keeps everything.
 */

const BACKUP_APP = 'fabrica';
const BACKUP_VERSION = 1;

export interface BackupData {
  accounts: Account[];
  presets: Preset[];
  brandKits: BrandKit[];
  assets: Asset[];
  carousels: Carousel[];
  contentRecords: ContentRecord[];
  experiments: Experiment[];
  calendarEntries: CalendarEntry[];
  /** Image files by asset id, as data URLs. */
  files: Record<string, string>;
}

interface BackupFile extends Omit<BackupData, 'presets' | 'contentRecords' | 'experiments' | 'calendarEntries'> {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  /** Missing in backups made before presets existed. */
  presets?: Preset[];
  /** Missing in backups made before the winners library existed. */
  contentRecords?: ContentRecord[];
  /** Missing in backups made before experiments and the calendar existed. */
  experiments?: Experiment[];
  calendarEntries?: CalendarEntry[];
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Não consegui ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<BackupFile>;
  return file.app === BACKUP_APP && Array.isArray(file.accounts) && Array.isArray(file.brandKits) && Array.isArray(file.assets) && Array.isArray(file.carousels) && typeof file.files === 'object';
}

export function buildBackup(data: BackupData): Blob {
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...data };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Reads a backup, filling what older versions did not have. Only assets with their image file come back. */
export async function readBackup(file: Blob): Promise<BackupData> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Esse arquivo não é um backup da Fábrica.');
  }
  if (!isBackupFile(parsed)) throw new Error('Esse arquivo não é um backup da Fábrica.');
  return {
    accounts: parsed.accounts,
    presets: parsed.presets ?? [],
    brandKits: parsed.brandKits,
    assets: parsed.assets.filter((asset) => asset.id in parsed.files),
    carousels: parsed.carousels,
    contentRecords: (parsed.contentRecords ?? []).map(normalizeRecord),
    experiments: parsed.experiments ?? [],
    calendarEntries: parsed.calendarEntries ?? [],
    files: parsed.files,
  };
}

export function summarize(data: BackupData): BackupSummary {
  return {
    presets: data.presets.length,
    accounts: data.accounts.length,
    brandKits: data.brandKits.length,
    assets: data.assets.length,
    carousels: data.carousels.length,
    contentRecords: data.contentRecords.length,
    experiments: data.experiments.length,
    calendarEntries: data.calendarEntries.length,
  };
}
