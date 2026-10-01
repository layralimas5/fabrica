import type { AssetRepository } from '../application/ports';
import type { Asset } from '../domain/asset';

const bitmaps = new Map<string, Promise<ImageBitmap>>();
const objectUrls = new Map<string, Promise<string>>();
const blobs = new Map<string, Promise<Blob>>();

function blobOf(repo: AssetRepository, asset: Asset): Promise<Blob> {
  let pending = blobs.get(asset.id);
  if (!pending) {
    pending = repo.fetchBlob(asset);
    pending.catch(() => blobs.delete(asset.id));
    blobs.set(asset.id, pending);
  }
  return pending;
}

/** Full-resolution bitmap for canvas rendering, shared across previews and exports. */
export function bitmapOf(repo: AssetRepository, asset: Asset): Promise<ImageBitmap> {
  let pending = bitmaps.get(asset.id);
  if (!pending) {
    pending = blobOf(repo, asset).then((blob) => createImageBitmap(blob));
    pending.catch(() => bitmaps.delete(asset.id));
    bitmaps.set(asset.id, pending);
  }
  return pending;
}

/** Object URL for <img> thumbnails in the library and pickers. */
export function thumbnailUrlOf(repo: AssetRepository, asset: Asset): Promise<string> {
  let pending = objectUrls.get(asset.id);
  if (!pending) {
    pending = blobOf(repo, asset).then((blob) => URL.createObjectURL(blob));
    pending.catch(() => objectUrls.delete(asset.id));
    objectUrls.set(asset.id, pending);
  }
  return pending;
}

export function forgetAsset(id: string): void {
  bitmaps.get(id)?.then((bitmap) => bitmap.close()).catch(() => undefined);
  objectUrls.get(id)?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
  bitmaps.delete(id);
  objectUrls.delete(id);
  blobs.delete(id);
}
