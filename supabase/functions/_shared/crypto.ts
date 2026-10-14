/**
 * AES-256-GCM for OAuth tokens at rest. The key (32 random bytes, base64) lives only in the functions' secrets
 * (TOKEN_ENCRYPTION_KEY); the database keeps "v1.<iv>.<ciphertext>" and is useless without it.
 * Generate a key with: openssl rand -base64 32
 */

const VERSION = 'v1';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function importKey(base64Key: string | undefined): Promise<CryptoKey> {
  if (!base64Key) throw new Error('TOKEN_ENCRYPTION_KEY não configurada.');
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64 (openssl rand -base64 32).');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `${VERSION}.${toBase64(iv)}.${toBase64(cipher)}`;
}

export async function decrypt(key: CryptoKey, sealed: string): Promise<string> {
  const [version, iv, cipher] = sealed.split('.');
  if (version !== VERSION || !iv || !cipher) throw new Error('Token guardado em formato desconhecido.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(cipher));
  return new TextDecoder().decode(plain);
}

/** URL-safe random string for OAuth state and short codes. */
export function randomToken(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex, used to keep server secrets of projects without storing them in clear. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings in constant time for their length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
