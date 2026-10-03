import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../../domain/asset';
import { SupabaseBackup } from './supabaseBackup';

const PIXEL = 'data:image/jpeg;base64,/9j/4AAQ';
const asset = (id: string, name: string): Asset => ({ id, name, folder: 'Geral', kind: 'foto', tags: [], width: 10, height: 10, mimeType: 'image/jpeg', createdAt: '2026-10-01T00:00:00.000Z' });

function fakeClient(uploadResults: Record<string, ('ok' | 'fail')[]>, storedIds: string[]) {
  const upserts: Record<string, unknown[]> = {};
  const attempts: Record<string, number> = {};
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: async () => ({ data: storedIds.map((id) => ({ id })), error: null }),
      upsert: async (rows: unknown[]) => {
        upserts[table] = [...(upserts[table] ?? []), ...rows];
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          const id = path.split('/')[1].split('.')[0];
          const results = uploadResults[id] ?? ['ok'];
          const result = results[Math.min(attempts[id] ?? 0, results.length - 1)];
          attempts[id] = (attempts[id] ?? 0) + 1;
          return { error: result === 'ok' ? null : { message: 'HTTP 504 error' } };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, upserts, attempts };
}

const backupFile = (assets: Asset[]) =>
  new Blob([JSON.stringify({ app: 'fabrica', version: 1, exportedAt: '', accounts: [], brandKits: [], presets: [], assets, carousels: [], files: Object.fromEntries(assets.map((item) => [item.id, PIXEL])) })]);

afterEach(() => vi.useRealTimers());

describe('restoring a backup into Supabase', () => {
  it('retries a photo that times out, skips the ones already there and reports the ones that never went up', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, upserts, attempts } = fakeClient({ flaky: ['fail', 'fail', 'ok'], broken: ['fail'] }, ['done']);
    const backup = new SupabaseBackup(client, { carousels: { get: async () => null } } as never);

    const pending = backup.importAll(backupFile([asset('done', 'done.jpg'), asset('flaky', 'flaky.jpg'), asset('broken', 'broken.jpg'), asset('fine', 'fine.jpg')]));
    await vi.runAllTimersAsync();
    const summary = await pending;

    expect(attempts).toEqual({ flaky: 3, broken: 4, fine: 1 });
    expect((upserts.assets as { id: string }[]).map((row) => row.id)).toEqual(['flaky', 'fine']);
    expect(summary.assets).toBe(3);
    expect(summary.failedAssets).toEqual(['broken.jpg']);
  });
});
