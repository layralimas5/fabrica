import type { Platform } from './carousel';

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
  createdAt: string;
  updatedAt: string;
}

export type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

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
  return { name: '', handle: '', platform, avatar: null, brandKitId: null };
}

export function identityOf(account: Pick<Account, 'name' | 'handle' | 'avatar'>): AccountIdentity {
  return { name: account.name.trim(), handle: normalizeHandle(account.handle), avatar: account.avatar };
}

export function accountsFor(accounts: Account[], platform: Platform): Account[] {
  return accounts.filter((account) => account.platform === platform);
}
