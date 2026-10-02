import { describe, expect, it } from 'vitest';
import type { Asset } from '../domain/asset';
import { bulkEditAssets } from './bulkEditAssets';
import type { Services } from './ports';

const asset = (id: string, tags: string[], folder = 'Geral'): Asset => ({ id, name: `${id}.jpg`, folder, kind: 'foto', tags, width: 1, height: 1, mimeType: 'image/jpeg', createdAt: '' });

function servicesRecording(updates: string[]): Services {
  return {
    assets: {
      update: async (id: string, patch: Pick<Asset, 'tags' | 'folder' | 'kind' | 'name'>) => {
        updates.push(id);
        return { ...asset(id, []), ...patch };
      },
    },
  } as unknown as Services;
}

describe('bulkEditAssets', () => {
  it('adds tags without duplicates and moves the photos', async () => {
    const updates: string[] = [];
    const saved = await bulkEditAssets(servicesRecording(updates), [asset('a', ['café']), asset('b', [])], { addTags: ['café', 'manhã'], moveTo: 'Ella' });
    expect(saved.map((item) => item.tags)).toEqual([['café', 'manhã'], ['café', 'manhã']]);
    expect(saved.every((item) => item.folder === 'Ella')).toBe(true);
  });

  it('skips photos that would not change', async () => {
    const updates: string[] = [];
    await bulkEditAssets(servicesRecording(updates), [asset('a', ['café'], 'Ella')], { addTags: ['café'], moveTo: 'Ella' });
    expect(updates).toEqual([]);
  });
});
