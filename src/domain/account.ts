import { normalizeTime, type Platform } from './carousel';
import { VISUAL_STYLES, type VisualStyle } from './brandKit';

/** A social profile the user posts for: shown in the header of post-style slides. */
export interface Account {
  id: string;
  /** Display name, in bold next to the photo. */
  name: string;
  /** Username without spaces, shown as @handle. */
  handle: string;
  platform: Platform;
  /** Small square JPEG as a data URL, or null to show the initial. */
  avatar: string | null;
  /** Brand kit selected automatically when this account is chosen. */
  brandKitId: string | null;
  /** Project the account belongs to, e.g. "Momentumm". Default project of what it creates. */
  project: string;
  /** Paused accounts stay in history and analytics but leave the pickers. */
  status: AccountStatus;
  notes: string;
  /** What the account's tests proved: used by the create screen until another test says otherwise. */
  defaults: AccountDefaults;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDefaults {
  /** Posting time that won a time test, filled in when scheduling. */
  postingTime: string | null;
  /** Slide model that won a format test, preselected on the create screen. */
  visualStyle: VisualStyle | null;
  /** Test that set these defaults, shown next to them. */
  source: string | null;
}

export const EMPTY_ACCOUNT_DEFAULTS: AccountDefaults = { postingTime: null, visualStyle: null, source: null };

export function normalizeAccountDefaults(raw: Partial<AccountDefaults> | null | undefined): AccountDefaults {
  return {
    postingTime: normalizeTime(raw?.postingTime),
    visualStyle: VISUAL_STYLES.includes(raw?.visualStyle as VisualStyle) ? (raw?.visualStyle as VisualStyle) : null,
    source: typeof raw?.source === 'string' && raw.source.trim() ? raw.source.trim().slice(0, 120) : null,
  };
}

export type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

export const ACCOUNT_STATUSES = ['active', 'paused'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = { active: 'Ativa', paused: 'Pausada' };

/** Networks planned next: listed as "em breve" so the account model already has room for them. */
export const UPCOMING_PLATFORMS = ['YouTube', 'Pinterest', 'Threads', 'LinkedIn'] as const;
export const MAX_ACCOUNT_NOTES = 500;
export const MAX_ACCOUNT_PROJECT = 60;

/** Fills fields added after the first release so older saved accounts keep working. */
export function normalizeAccount(account: Account): Account {
  return {
    ...account,
    project: typeof account.project === 'string' ? account.project : '',
    status: account.status === 'paused' ? 'paused' : 'active',
    notes: typeof account.notes === 'string' ? account.notes : '',
    defaults: normalizeAccountDefaults(account.defaults),
  };
}

export function isActiveAccount(account: Pick<Account, 'status'>): boolean {
  return account.status !== 'paused';
}

/** "Momentumm — TikTok Principal": project and name, the way accounts are told apart in pickers. */
export function accountLabel(account: Pick<Account, 'name' | 'handle' | 'project'>): string {
  const name = account.name.trim() || `@${account.handle}`;
  return account.project && !name.toLowerCase().startsWith(account.project.toLowerCase()) ? `${account.project} — ${name}` : name;
}

/** What a slide needs to draw the profile header. */
export interface AccountIdentity {
  name: string;
  handle: string;
  avatar: string | null;
}

export const MAX_ACCOUNT_NAME = 60;
export const MAX_HANDLE = 40;

/** "@Ella Refina " → "ellarefina": the @ is added when drawing. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '').slice(0, MAX_HANDLE);
}

export function emptyAccount(platform: Platform): AccountInput {
  return { name: '', handle: '', platform, avatar: null, brandKitId: null, project: '', status: 'active', notes: '', defaults: EMPTY_ACCOUNT_DEFAULTS };
}

export function identityOf(account: Pick<Account, 'name' | 'handle' | 'avatar'>): AccountIdentity {
  return { name: account.name.trim(), handle: normalizeHandle(account.handle), avatar: account.avatar };
}

export function accountsFor(accounts: Account[], platform: Platform): Account[] {
  return accounts.filter((account) => account.platform === platform);
}
