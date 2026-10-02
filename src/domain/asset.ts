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
export const PRODUCT_FOLDER = 'Produto';

export const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
export const UPLOAD_RULES_MESSAGE = 'só imagens JPG, PNG, WEBP, AVIF ou GIF até 15 MB';

export function isAcceptedImage(file: Pick<File, 'type' | 'size'>): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE;
}

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ');
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,;\n]/).map(normalizeTag).filter(Boolean))];
}

export const MAX_FOLDER_LENGTH = 60;

export function normalizeFolder(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLDER_LENGTH);
}

export function inFolders(asset: Asset, folders: readonly string[]): boolean {
  return folders.length === 0 || folders.includes(asset.folder);
}

export function isPhotoLike(asset: Asset): boolean {
  return asset.kind !== 'icone' && asset.kind !== 'logo';
}
