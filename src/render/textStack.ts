export type StackKind = 'label' | 'title' | 'subtitle' | 'body' | 'bullet';

export interface StackItem {
  kind: StackKind;
  text: string;
  color: string;
  marker?: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StackStyle {
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  uppercase: boolean;
  tracking: number;
  titleSize: number;
  align: 'left' | 'center';
  vAlign: 'top' | 'center' | 'bottom';
  markerColor: string;
  markerText: string;
  titleLineHeight?: number;
  /** Share of the box width the text may use, centered or left-aligned like the text. */
  widthScale?: number;
  /** Multiplies every line height. */
  lineHeightScale?: number;
}

interface MeasuredItem {
  item: StackItem;
  font: string;
  size: number;
  lineHeight: number;
  lines: string[];
  gapBefore: number;
  indent: number;
}

const BASE_SIZES: Record<Exclude<StackKind, 'title'>, number> = { label: 24, subtitle: 38, body: 33, bullet: 35 };
const LINE_HEIGHTS: Record<StackKind, number> = { label: 1.3, title: 1.06, subtitle: 1.3, body: 1.42, bullet: 1.32 };
const MIN_SCALE = 0.45;

/** Draws a vertical text stack, shrinking it uniformly until it fits the box. Returns the occupied rectangle. */
export function drawStack(ctx: CanvasRenderingContext2D, items: StackItem[], fullBox: Box, style: StackStyle): Box {
  const narrowed = fullBox.width * Math.min(1, style.widthScale ?? 1);
  const box = { ...fullBox, width: narrowed, x: style.align === 'center' ? fullBox.x + (fullBox.width - narrowed) / 2 : fullBox.x };
  let scale = 1;
  let measured = measure(ctx, items, box.width, style, scale);
  while (totalHeight(measured) > box.height && scale > MIN_SCALE) {
    scale -= 0.04;
    measured = measure(ctx, items, box.width, style, scale);
  }

  const height = totalHeight(measured);
  let y = box.y;
  if (style.vAlign === 'center') y = box.y + (box.height - height) / 2;
  if (style.vAlign === 'bottom') y = box.y + box.height - height;
  const top = y;

  ctx.textBaseline = 'top';
  for (const entry of measured) {
    y += entry.gapBefore;
    ctx.font = entry.font;
    applyTracking(ctx, entry.item.kind === 'title' ? style.tracking : 0, entry.size);

    if (entry.item.marker) drawMarker(ctx, entry, box.x, y, style);

    entry.lines.forEach((line, index) => {
      const lineY = y + index * entry.size * entry.lineHeight;
      ctx.fillStyle = entry.item.color;
      ctx.textAlign = style.align;
      const x = style.align === 'center' ? box.x + box.width / 2 : box.x + entry.indent;
      ctx.fillText(line, x, lineY + (entry.size * (entry.lineHeight - 1)) / 2);
    });
    y += entry.lines.length * entry.size * entry.lineHeight;
  }
  applyTracking(ctx, 0, 0);

  return { x: box.x, y: top, width: box.width, height };
}

function measure(ctx: CanvasRenderingContext2D, items: StackItem[], width: number, style: StackStyle, scale: number): MeasuredItem[] {
  return items.map((item, index) => {
    const isTitle = item.kind === 'title';
    const size = Math.round((item.kind === 'title' ? style.titleSize : BASE_SIZES[item.kind]) * scale);
    const weight = isTitle ? style.headingWeight : item.kind === 'label' ? 700 : style.bodyWeight;
    const family = isTitle ? style.headingFont : style.bodyFont;
    const font = `${weight} ${size}px "${family}", system-ui, sans-serif`;
    const text = isTitle && style.uppercase ? item.text.toUpperCase() : item.kind === 'label' ? item.text.toUpperCase() : item.text;
    const indent = item.marker ? size * 1.7 : 0;

    ctx.font = font;
    applyTracking(ctx, isTitle ? style.tracking : 0, size);
    const lines = wrap(ctx, text, width - indent);
    const previous = items[index - 1];
    const gapBefore = previous ? gapBetween(previous.kind, item.kind) * scale : 0;
    const baseLineHeight = isTitle && style.titleLineHeight ? style.titleLineHeight : LINE_HEIGHTS[item.kind];
    return { item, font, size, lineHeight: baseLineHeight * (style.lineHeightScale ?? 1), lines, gapBefore, indent };
  });
}

function gapBetween(previous: StackKind, current: StackKind): number {
  if (previous === 'label') return 22;
  if (previous === 'bullet' && current === 'bullet') return 26;
  if (current === 'bullet') return 44;
  return previous === 'title' ? 34 : 24;
}

function totalHeight(items: MeasuredItem[]): number {
  return items.reduce((sum, entry) => sum + entry.gapBefore + entry.lines.length * entry.size * entry.lineHeight, 0);
}

/** Breaks text into lines that fit maxWidth. Blank lines are kept as empty strings (paragraph breaks). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return text.split('\n').flatMap((paragraph) => {
    if (!paragraph.trim()) return [''];
    const words = paragraph.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  });
}

function drawMarker(ctx: CanvasRenderingContext2D, entry: MeasuredItem, x: number, y: number, style: StackStyle): void {
  const diameter = entry.size * 1.25;
  const centerY = y + (entry.size * entry.lineHeight) / 2;
  ctx.save();
  ctx.fillStyle = style.markerColor;
  ctx.beginPath();
  ctx.arc(x + diameter / 2, centerY, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.markerText;
  ctx.font = `700 ${Math.round(entry.size * 0.62)}px "${style.bodyFont}", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.item.marker ?? '', x + diameter / 2, centerY + 1);
  ctx.restore();
  ctx.textBaseline = 'top';
}

function applyTracking(ctx: CanvasRenderingContext2D, trackingEm: number, size: number): void {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(trackingEm * size).toFixed(2)}px`;
}
