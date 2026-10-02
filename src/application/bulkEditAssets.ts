import { mergeTags, normalizeFolder, type Asset } from '../domain/asset';
import type { Services } from './ports';

export interface BulkEdit {
  /** Added to each photo's own tags, without duplicates. */
  addTags: string[];
  /** New folder for every photo, or null to keep each one where it is. */
  moveTo: string | null;
}

/** Applies the same tags and/or folder to many photos at once. Returns the saved photos. */
export async function bulkEditAssets(services: Services, assets: Asset[], { addTags, moveTo }: BulkEdit, onProgress?: (done: number) => void): Promise<Asset[]> {
  const folder = moveTo ? normalizeFolder(moveTo) : null;
  const saved: Asset[] = [];
  for (const asset of assets) {
    const tags = mergeTags(asset.tags, addTags);
    const nextFolder = folder || asset.folder;
    const changed = tags.length !== asset.tags.length || nextFolder !== asset.folder;
    saved.push(changed ? await services.assets.update(asset.id, { name: asset.name, kind: asset.kind, folder: nextFolder, tags }) : asset);
    onProgress?.(saved.length);
  }
  return saved;
}
