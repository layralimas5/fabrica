import { FORMAT_SIZES, type CarouselFormat, type Slide } from '../domain/carousel';
import { splitSentences } from '../domain/text';
import { withAlpha, type SlideTheme } from '../domain/theme';
import { ensureFont } from './fonts';
import { drawStack, wrap, type Box, type StackItem, type StackStyle } from './textStack';

export interface SlideRenderInput {
  slide: Slide;
  theme: SlideTheme;
  format: CarouselFormat;
  index: number;
  total: number;
  image: ImageBitmap | null;
  logo: ImageBitmap | null;
  avatar: ImageBitmap | null;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  input: SlideRenderInput;
}


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
  native_photo: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    if (image) drawCover(frame, image, { x: 0, y: 0, width: frame.width, height: frame.height }, 0);
    if (theme.imageOverlay > 0) {
      frame.ctx.fillStyle = `rgba(0,0,0,${theme.imageOverlay})`;
      frame.ctx.fillRect(0, 0, frame.width, frame.height);
    }
    drawPhotoText(frame, [slide.title, slide.subtitle, slide.body, ...slide.bullets].filter(Boolean).join('\n'));
  },

  post_image: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    const pad = theme.padding;
    const headerBottom = drawPostHeader(frame, pad);
    const textTop = headerBottom + 56;
    const textBox = { x: pad, y: textTop, width: frame.width - pad * 2, height: frame.height * 0.26 };
    const area = drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(textBox, slide), postStackStyle(frame, 56, 'top'));
    const imageTop = Math.max(area.y + area.height, textTop) + 52;
    if (image) drawCover(frame, image, { x: pad, y: imageTop, width: frame.width - pad * 2, height: frame.height - imageTop - pad }, Math.min(theme.radius, 16));
  },

  post_text: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    const pad = theme.padding;
    const headerSpace = POST_AVATAR + 64;
    const textBox = { x: pad, y: pad + headerSpace, width: frame.width - pad * 2, height: frame.height - pad * 2 - headerSpace };
    const area = drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(textBox, slide), postStackStyle(frame, 68, 'center'));
    drawPostHeader(frame, Math.max(pad, area.y - headerSpace));
  },

  text_center: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    drawHeader(frame, theme.text);
    const box = contentBox(frame);
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: slide.role === 'hook' ? 112 : 92, align: 'center', vAlign: 'center' }));
  },

  big_statement: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.emphasisBackground);
    drawHeader(frame, theme.emphasisText);
    const box = contentBox(frame);
    const style = stackStyle(frame, { size: 108, align: 'left', vAlign: 'center' });
    drawStack(frame.ctx, textItems(slide, theme.emphasisText, withAlpha(theme.emphasisText, 0.75)), offsetBox(box, slide), style);
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
  },

  image_top_text_bottom: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    const pad = theme.padding;
    const imageBox = { x: pad, y: pad, width: frame.width - pad * 2, height: frame.height * 0.48 };
    if (image) drawCover(frame, image, imageBox, theme.radius);
    const textTop = imageBox.y + imageBox.height + 56;
    const box = { x: pad, y: textTop, width: frame.width - pad * 2, height: frame.height - textTop - pad / 2 };
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: 66, align: 'left', vAlign: 'top' }));
  },

  image_left_text_right: (frame) => {
    const { theme, slide, image } = frame.input;
    fill(frame, theme.background);
    const columnWidth = Math.round(frame.width * 0.44);
    if (image) drawCover(frame, image, { x: 0, y: 0, width: columnWidth, height: frame.height }, 0);
    const pad = theme.padding * 0.7;
    const box = { x: columnWidth + pad, y: theme.padding, width: frame.width - columnWidth - pad * 2, height: frame.height - theme.padding * 2 };
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: 62, align: 'left', vAlign: 'center' }));
  },

  text_side: (frame) => {
    const { theme, slide } = frame.input;
    fill(frame, theme.background);
    drawHeader(frame, theme.text);
    const box = contentBox(frame);
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), stackStyle(frame, { size: 86, align: 'left', vAlign: 'center' }));
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
  },

  cta: (frame) => {
    const { theme, slide, logo } = frame.input;
    fill(frame, theme.background);
    const box = contentBox(frame);
    if (logo) drawLogo(frame, logo, frame.width / 2, box.y + 40, 120, 'center');
    const style = stackStyle(frame, { size: 86, align: 'center', vAlign: 'center' });
    drawStack(frame.ctx, textItems(slide, theme.text, theme.muted), offsetBox(box, slide), style);
  },
};

const PHOTO_TEXT_LINE_HEIGHT = 1.28;

/** TikTok-native caption: wrapped lines with outline, shadow or highlight boxes, no footer. */
function drawPhotoText(frame: Frame, text: string): void {
  const { ctx, width, height } = frame;
  const { theme, slide } = frame.input;
  const { style, position, color } = theme.photoText;
  const size = Math.round(theme.photoText.size * slide.style.fontScale);
  const maxWidth = width * 0.84;

  ctx.save();
  ctx.font = `${theme.headingWeight} ${size}px "${theme.headingFont}", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, maxWidth);
  const lineHeight = size * PHOTO_TEXT_LINE_HEIGHT;
  const blockHeight = lines.length * lineHeight;
  const top = position === 'top' ? height * 0.16 : position === 'bottom' ? height * 0.74 - blockHeight : (height - blockHeight) / 2;
  const x = width / 2 + slide.style.offsetX;

  lines.forEach((line, index) => {
    const y = top + slide.style.offsetY + lineHeight * index + lineHeight / 2;
    if (style === 'box-light' || style === 'box-dark') {
      const padX = size * 0.32;
      const boxHeight = size * 1.3;
      const lineWidth = ctx.measureText(line).width;
      ctx.fillStyle = style === 'box-light' ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.roundRect(x - lineWidth / 2 - padX, y - boxHeight / 2, lineWidth + padX * 2, boxHeight, size * 0.22);
      ctx.fill();
      ctx.fillStyle = style === 'box-light' ? '#000000' : '#ffffff';
      ctx.fillText(line, x, y);
      return;
    }
    if (style === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(line, x, y);
    }
    if (style === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = size * 0.35;
      ctx.shadowOffsetY = size * 0.04;
    }
    ctx.fillStyle = color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

const POST_AVATAR = 132;

/** Social-post header: round avatar and bold display name. Returns its bottom edge. */
function drawPostHeader(frame: Frame, top: number): number {
  const { ctx } = frame;
  const { theme, avatar } = frame.input;
  const x = theme.padding;
  const radius = POST_AVATAR / 2;
  const centerY = top + radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  if (avatar) {
    ctx.clip();
    const scale = Math.max(POST_AVATAR / avatar.width, POST_AVATAR / avatar.height);
    const width = avatar.width * scale;
    const height = avatar.height * scale;
    ctx.drawImage(avatar, x + radius - width / 2, centerY - height / 2, width, height);
  } else {
    ctx.fillStyle = theme.emphasisBackground;
    ctx.fill();
    ctx.fillStyle = theme.emphasisText;
    ctx.font = `700 ${Math.round(POST_AVATAR * 0.42)}px "${theme.bodyFont}", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((theme.displayName.trim()[0] ?? '?').toUpperCase(), x + radius, centerY + 2);
  }
  ctx.restore();

  const textX = x + POST_AVATAR + 30;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.text;
  ctx.font = `700 46px "${theme.bodyFont}", system-ui, sans-serif`;
  ctx.fillText(theme.displayName, textX, centerY + 16);
  ctx.restore();
  return top + POST_AVATAR;
}

/** Post text reads like a caption: body font, regular weight, no tracking or caps. */
function postStackStyle(frame: Frame, size: number, vAlign: StackStyle['vAlign']): StackStyle {
  const { theme, slide } = frame.input;
  return {
    ...stackStyle(frame, { size, align: 'center', vAlign }),
    headingFont: slide.style.headingFont ?? theme.bodyFont,
    headingWeight: theme.bodyWeight,
    uppercase: false,
    tracking: 0,
    titleLineHeight: 1.28,
  };
}

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
  return { x: pad, y: pad + header, width: frame.width - pad * 2, height: frame.height - pad * 2 - header };
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


function drawLogo(frame: Frame, logo: ImageBitmap, x: number, y: number, maxHeight: number, align: 'left' | 'center'): void {
  const height = Math.min(maxHeight, logo.height);
  const width = (logo.width / logo.height) * height;
  frame.ctx.drawImage(logo, align === 'center' ? x - width / 2 : x, y, width, height);
}

