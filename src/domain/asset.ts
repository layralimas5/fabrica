export const ASSET_KINDS = [
  'foto',
  'mockup',
  'screenshot',
  'textura',
  'fundo',
  'lifestyle',
  'produto',
  'ilustracao',
  'icone',
  'logo',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export interface Asset {
  id: string;
  name: string;
  folder: string;
  kind: AssetKind;
  tags: string[];
  width: number;
  height: number;
  mimeType: string;
  createdAt: string;
}

export interface AssetUpload {
  file: File;
  folder: string;
  kind: AssetKind;
  tags: string[];
}

export const UNSORTED_FOLDER = 'Geral';

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ');
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,;\n]/).map(normalizeTag).filter(Boolean))];
}

export function isPhotoLike(asset: Asset): boolean {
  return asset.kind !== 'icone' && asset.kind !== 'logo';
}
