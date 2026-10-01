import { FORMAT_SIZES, type CarouselFormat, type Slide } from '../domain/carousel';
import { splitSentences } from '../domain/text';
import { withAlpha, type SlideTheme } from '../domain/theme';
import { ensureFont } from './fonts';
import { drawStack, type Box, type StackItem, type StackStyle } from './textStack';

export interface SlideRenderInput {
  slide: Slide;
  theme: SlideTheme;
  format: CarouselFormat;
  index: number;
  total: number;
  image: ImageBitmap | null;
  logo: ImageBitmap | null;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  input: SlideRenderInput;
}

const FOOTER = 90;

export async function renderSlideToCanvas(input: SlideRenderInput, scale = 1): Promise<HTMLCanvasElement> {
  const { width, height } = FORMAT_SIZES[input.format];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não suporta canvas 2D.');

  const heading = input.slide.style.headingFont ?? input.theme.headingFont;
  await Promise.all([
    ensureFont(heading, [input.theme.headingWeight]),
    ensureFont(input.theme.bodyFont, [input.theme.bodyWeight, 700]),
  ]);

  ctx.scale(scale, scale);
  const frame: Frame = { ctx, width, height, input: { ...input, theme: { ...input.theme, headingFont: heading } } };
  LAYOUT_RENDERERS[input.slide.layout](frame);
  return canvas;
}

const LAYOUT_RENDERERS: Record<Slide['layout'], (frame: Frame) => void> = {
  text_center: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    drawHeader(frame, theme.text);
    const box = contentBox(frame);
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: slide.role === 'hook' ? 112 : 92, align: 'center', vAlign: 'center' }));
    drawFooter(frame, theme.muted);
  },

  big_statement: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.emphasisBackground);
    drawHeader(frame, theme.emphasisText);
    const box = contentBox(frame);
    const style = stackStyle(frame, { size: 108, align: 'left', vAlign: 'center' });
    const area = drawStack(frame.ctx, textItems(slide, theme.emphasisText, withAlpha(theme.emphasisText, 0.75)), offsetBox(box, slide), style);
    frame.ctx.fillStyle = theme.accent === theme.emphasisBackground ? theme.emphasisText : theme.accent;
    frame.ctx.fillRect(area.x, area.y - 52, 96, 12);
    drawFooter(frame, withAlpha(theme.emphasisText, 0.7));
  },

  image_full_quote: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.emphasisBackground);
    if (image) drawCover(frame, image, { x: 0, y: 0, width: frame.width, height: frame.height }, 0);
    const gradient = frame.ctx.createLinearGradient(0, frame.height * 0.3, 0, frame.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, theme.imageOverlay + 0.45)})`);
    frame.ctx.fillStyle = gradient;
    frame.ctx.fillRect(0, 0, frame.width, frame.height);
    drawHeader(frame, '#ffffff');

    const box = contentBox(frame);
    const lower = { ...box, y: box.y + box.height * 0.35, height: box.height * 0.65 };
    drawStack(frame.ctx, textItems(slide, '#ffffff', 'rgba(255,255,255,0.82)'), offsetBox(lower, slide), stackStyle(frame, { size: slide.role === 'hook' ? 100 : 84, align: 'left', vAlign: 'bottom' }));
    drawFooter(frame, 'rgba(255,255,255,0.8)');
  },

  image_top_text_bottom: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    const pad = theme.padding;
    const imageBox = { x: pad, y: pad, width: frame.width - pad * 2, height: frame.height * 0.48 };
    if (image) drawCover(frame, image, imageBox, theme.radius);
    const textTop = imageBox.y + imageBox.height + 56;
    const box = { x: pad, y: textTop, width: frame.width - pad * 2, height: frame.height - textTop - FOOTER - pad / 2 };
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: 66, align: 'left', vAlign: 'top' }));
    drawFooter(frame, theme.muted);
  },

  image_left_text_right: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    const columnWidth = Math.round(frame.width * 0.44);
    if (image) drawCover(frame, image, { x: 0, y: 0, width: columnWidth, height: frame.height }, 0);
    const pad = theme.padding * 0.7;
    const box = { x: columnWidth + pad, y: theme.padding, width: frame.width - columnWidth - pad * 2, height: frame.height - theme.padding * 2 - FOOTER };
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: 62, align: 'left', vAlign: 'center' }));
    drawFooter(frame, theme.muted, columnWidth);
  },

  text_side: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    drawHeader(frame, theme.text);
    const box = contentBox(frame);
    const inner = { ...box, x: box.x + 44, width: box.width - 44 };
    const area = drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(inner, slide), stackStyle(frame, { size: 86, align: 'left', vAlign: 'center' }));
    frame.ctx.fillStyle = theme.accent;
    frame.ctx.fillRect(box.x + slide.style.offsetX, area.y, 10, area.height);
    drawFooter(frame, theme.muted);
  },

  list: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    drawHeader(frame, theme.text);
    const items: StackItem[] = [{ kind: 'title', text: slide.title, color: theme.text }];
    if (slide.subtitle) items.push({ kind: 'subtitle', text: slide.subtitle, color: theme.muted });
    const entries = slide.bullets.length > 0 ? slide.bullets : splitSentences(slide.body ?? '');
    entries.forEach((text, index) => items.push({ kind: 'bullet', text, color: theme.text, marker: String(index + 1) }));
    drawStack(frame.ctx, items, offsetBox(contentBox(frame), slide), stackStyle(frame, { size: 76, align: 'left', vAlign: 'center' }));
    drawFooter(frame, theme.muted);
  },

  cta: (frame) => {
    const { theme, slide, logo } = frame.input;
    fill(frame, theme.background);
    const box = contentBox(frame);
    if (logo) drawLogo(frame, logo, frame.width / 2, box.y + 40, 120, 'center');
    const style = stackStyle(frame, { size: 86, align: 'center', vAlign: 'center' });
    const area = drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox({ ...box, height: box.height - 140 }, slide), style);
    if (theme.handle) drawPill(frame, theme.handle, frame.width / 2, area.y + area.height + 90);
    drawFooter(frame, theme.muted);
  },
};

function textItems(slide: Slide, color: string, muted: string): StackItem[] {
  const items: StackItem[] = [{ kind: 'title', text: slide.title, color }];
  if (slide.subtitle) items.push({ kind: 'subtitle', text: slide.subtitle, color: muted });
  if (slide.body) items.push({ kind: 'body', text: slide.body, color: muted });
  slide.bullets.forEach((text, index) => items.push({ kind: 'bullet', text, color, marker: String(index + 1) }));
  return items;
}

function stackStyle(frame: Frame, options: { size: number; align: StackStyle['align']; vAlign: StackStyle['vAlign'] }): StackStyle {
  const { theme, slide } = frame.input;
  return {
    headingFont: theme.headingFont,
    bodyFont: theme.bodyFont,
    headingWeight: theme.headingWeight,
    bodyWeight: theme.bodyWeight,
    uppercase: theme.uppercase,
    tracking: theme.tracking,
    titleSize: options.size * slide.style.fontScale,
    align: options.align,
    vAlign: options.vAlign,
    markerColor: theme.accent,
    markerText: theme.accentText,
  };
}

function contentBox(frame: Frame): Box {
  const pad = frame.input.theme.padding;
  const header = frame.input.theme.ruleLines ? 70 : 0;
  return { x: pad, y: pad + header, width: frame.width - pad * 2, height: frame.height - pad * 2 - FOOTER - header };
}

function offsetBox(box: Box, slide: Slide): Box {
  return { ...box, x: box.x + slide.style.offsetX, y: box.y + slide.style.offsetY };
}

function fill(frame: Frame, color: string): void {
  frame.ctx.fillStyle = color;
  frame.ctx.fillRect(0, 0, frame.width, frame.height);
}

function drawCover(frame: Frame, image: ImageBitmap, box: Box, radius: number): void {
  const { ctx } = frame;
  const { theme } = frame.input;
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  ctx.save();
  if (theme.shadow && radius > 0) {
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = theme.surface;
    roundRect(ctx, box, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  roundRect(ctx, box, radius);
  ctx.clip();
  if (theme.grayscale) ctx.filter = 'grayscale(1)';
  ctx.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, radius);
}

function drawHeader(frame: Frame, color: string): void {
  const { theme, logo, slide } = frame.input;
  const pad = theme.padding;
  if (theme.ruleLines) {
    const { ctx } = frame;
    ctx.fillStyle = withAlpha(color.startsWith('#') ? color : '#ffffff', 0.35);
    ctx.fillRect(pad, pad + 40, frame.width - pad * 2, 2);
  }
  if (logo && slide.role === 'hook') drawLogo(frame, logo, pad, pad - 30, 64, 'left');
}

function drawFooter(frame: Frame, color: string, startX = 0): void {
  const { ctx, width, height } = frame;
  const { theme, index, total } = frame.input;
  const pad = theme.padding * 0.75;
  const y = height - pad - 6;
  ctx.save();
  ctx.font = `600 26px "${theme.bodyFont}", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  if (theme.handle) {
    ctx.textAlign = 'left';
    ctx.fillText(theme.handle, startX + pad, y);
  }
  ctx.textAlign = 'right';
  ctx.fillText(`${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`, width - pad, y);
  ctx.restore();
}

function drawLogo(frame: Frame, logo: ImageBitmap, x: number, y: number, maxHeight: number, align: 'left' | 'center'): void {
  const height = Math.min(maxHeight, logo.height);
  const width = (logo.width / logo.height) * height;
  frame.ctx.drawImage(logo, align === 'center' ? x - width / 2 : x, y, width, height);
}

function drawPill(frame: Frame, text: string, centerX: number, y: number): void {
  const { ctx } = frame;
  const { theme } = frame.input;
  ctx.save();
  ctx.font = `700 34px "${theme.bodyFont}", system-ui, sans-serif`;
  const width = ctx.measureText(text).width + 88;
  const height = 84;
  ctx.fillStyle = theme.emphasisBackground;
  roundRect(ctx, { x: centerX - width / 2, y, width, height }, height / 2);
  ctx.fill();
  ctx.fillStyle = theme.emphasisText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centerX, y + height / 2 + 1);
  ctx.restore();
}
