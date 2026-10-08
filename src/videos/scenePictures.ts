import type { AssetRepository } from '../application/ports';
import type { Asset } from '../domain/asset';
import { bitmapOf } from '../app/imageCache';

/** Picture of a scene: a library photo or a file picked from the computer (kept only in this tab). */
export type PictureSource = { kind: 'asset'; asset: Asset } | { kind: 'file'; file: File; url: string };

export function pictureUrl(source: PictureSource | null): string | null {
  return source?.kind === 'file' ? source.url : null;
}

export async function decodePicture(repo: AssetRepository, source: PictureSource | null): Promise<ImageBitmap | null> {
  if (!source) return null;
  return source.kind === 'asset' ? bitmapOf(repo, source.asset) : createImageBitmap(source.file);
}

/** Scene picture, or the default one (e.g. the avatar) when the scene has none. */
export function pictureFor(pictures: (PictureSource | null)[], fallback: PictureSource | null, index: number): PictureSource | null {
  return pictures[index] ?? fallback;
}
