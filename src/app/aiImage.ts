const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.82;

export interface AiImage {
  data: string;
  mediaType: 'image/jpeg';
}

/** Downsizes a photo to a small JPEG in base64, enough for the AI to see what is in it. */
export async function toAiImage(blob: Blob): Promise<AiImage> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não suporta canvas 2D.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}
