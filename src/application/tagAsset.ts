import { mergeTags, type Asset } from '../domain/asset';
import type { Services } from './ports';

export interface PreparedImage {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** Asks the AI what the photo shows and which themes it illustrates, and saves those tags on the asset. */
export async function tagAsset(services: Services, asset: Asset, image: PreparedImage): Promise<Asset> {
  const tags = await services.ai.tagImage({ image: image.data, mediaType: image.mediaType, hint: `${asset.name} · pasta ${asset.folder}` });
  const merged = mergeTags(asset.tags, tags);
  if (merged.length === asset.tags.length) return asset;
  return services.assets.update(asset.id, { name: asset.name, folder: asset.folder, kind: asset.kind, tags: merged });
}
