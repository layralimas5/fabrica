import type { ImageShade } from '../domain/shade';
import type { Box } from './textStack';

const black = (alpha: number) => `rgba(0,0,0,${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;

/** Paints the carousel shade over a photo box. Call it while the photo clip is still active. */
export function paintShade(ctx: CanvasRenderingContext2D, box: Box, { style, intensity }: ImageShade): void {
  if (style === 'none' || intensity <= 0) return;
  const { x, y, width, height } = box;

  if (style === 'uniform') {
    ctx.fillStyle = black(intensity);
  } else if (style === 'bottom' || style === 'top') {
    const gradient = style === 'bottom' ? ctx.createLinearGradient(0, y, 0, y + height) : ctx.createLinearGradient(0, y + height, 0, y);
    gradient.addColorStop(0.3, black(0));
    gradient.addColorStop(1, black(intensity * 1.5));
    ctx.fillStyle = gradient;
  } else if (style === 'cinema') {
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, black(intensity * 1.4));
    gradient.addColorStop(0.32, black(0));
    gradient.addColorStop(0.68, black(0));
    gradient.addColorStop(1, black(intensity * 1.4));
    ctx.fillStyle = gradient;
  } else {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const gradient = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.25, cx, cy, Math.hypot(width, height) / 2);
    gradient.addColorStop(0, black(0));
    gradient.addColorStop(1, black(intensity * 1.6));
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(x, y, width, height);
}
