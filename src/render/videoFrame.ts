import { VIDEO_HEIGHT, VIDEO_WIDTH, type VideoLook } from '../domain/video/look';
import { coverRect, framingFor } from '../domain/video/motion';
import { captionAt, sceneAt, type TimedCaption, type TimedScene, type VideoTimeline } from '../domain/video/timeline';

/** Pictures the video can draw: decoded once, reused on every frame. */
export type ScenePicture = ImageBitmap | null;

export interface FrameInput {
  timeline: VideoTimeline;
  pictures: ScenePicture[];
  look: VideoLook;
}

const CROSSFADE = 0.35;
const CAPTION_SIZE = 78;
const CAPTION_MAX_WIDTH = 940;
const CAPTION_LINE_HEIGHT = 1.18;
const POP_SECONDS = 0.14;
const HEADLINE_SIZE = 54;
const HEADLINE_TOP = 230;

/** Same color with transparency; colors that are not #rgb/#rrggbb fall back to white. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(255,255,255,${alpha})`;
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

const fontOf = (look: VideoLook, size: number) => `${look.weight} ${size}px "${look.font}", Inter, system-ui, sans-serif`;

function drawPicture(context: CanvasRenderingContext2D, picture: ScenePicture, scene: TimedScene, time: number, look: VideoLook) {
  if (!picture) {
    const glow = context.createRadialGradient(VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.35, 60, VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.35, VIDEO_HEIGHT * 0.8);
    glow.addColorStop(0, withAlpha(look.accent, 0.33));
    glow.addColorStop(1, withAlpha(look.accent, 0));
    context.fillStyle = look.background;
    context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    context.fillStyle = glow;
    context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    return;
  }
  const progress = (time - scene.start) / Math.max(scene.end - scene.start, 0.001);
  const rect = coverRect(picture.width, picture.height, VIDEO_WIDTH, VIDEO_HEIGHT, framingFor(scene.index, progress, look.motion));
  context.drawImage(picture, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
}

function drawShade(context: CanvasRenderingContext2D) {
  const shade = context.createLinearGradient(0, 0, 0, VIDEO_HEIGHT);
  shade.addColorStop(0, 'rgba(0,0,0,0.28)');
  shade.addColorStop(0.3, 'rgba(0,0,0,0.05)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  context.fillStyle = shade;
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
}

function wrapWords(context: CanvasRenderingContext2D, words: string[], maxWidth: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(' ');
    if (line.length && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = [word];
    } else line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawHeadline(context: CanvasRenderingContext2D, look: VideoLook) {
  const text = look.headline.trim();
  if (!text) return;
  context.font = fontOf(look, HEADLINE_SIZE);
  const lines = wrapWords(context, (look.uppercase ? text.toUpperCase() : text).split(/\s+/), CAPTION_MAX_WIDTH - 80).map((line) => line.join(' '));
  const lineHeight = HEADLINE_SIZE * 1.22;
  const width = Math.max(...lines.map((line) => context.measureText(line).width)) + 72;
  const height = lines.length * lineHeight + 44;
  context.fillStyle = 'rgba(255,255,255,0.96)';
  roundedRect(context, (VIDEO_WIDTH - width) / 2, HEADLINE_TOP, width, height, 26);
  context.fillStyle = '#111113';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => context.fillText(line, VIDEO_WIDTH / 2, HEADLINE_TOP + 22 + lineHeight * (index + 0.5)));
}

function drawCaption(context: CanvasRenderingContext2D, caption: TimedCaption, time: number, look: VideoLook) {
  const pop = Math.min(1, (time - caption.start) / POP_SECONDS);
  const scale = 0.9 + 0.1 * (1 - (1 - pop) ** 3);
  const centerY = VIDEO_HEIGHT * (look.captionPosition === 'meio' ? 0.62 : 0.72);

  context.save();
  context.translate(VIDEO_WIDTH / 2, centerY);
  context.scale(scale, scale);
  context.font = fontOf(look, CAPTION_SIZE);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  const words = caption.words.map((word) => ({ ...word, text: look.uppercase ? word.text.toUpperCase() : word.text }));
  const lines = wrapWords(context, words.map((word) => word.text), CAPTION_MAX_WIDTH);
  const lineHeight = CAPTION_SIZE * CAPTION_LINE_HEIGHT;
  const space = context.measureText(' ').width;
  let wordIndex = 0;

  lines.forEach((line, lineIndex) => {
    const y = (lineIndex - (lines.length - 1) / 2) * lineHeight;
    const lineWidth = context.measureText(line.join(' ')).width;
    let x = -lineWidth / 2;
    for (const text of line) {
      const word = words[wordIndex++];
      const width = context.measureText(text).width;
      const spoken = look.captionStyle !== 'simples' && time >= word.start && time < word.end + 0.05;
      if (spoken && look.captionStyle === 'caixa') {
        context.fillStyle = look.accent;
        roundedRect(context, x - 16, y - CAPTION_SIZE * 0.62, width + 32, CAPTION_SIZE * 1.2, 18);
      }
      context.lineWidth = 14;
      context.strokeStyle = 'rgba(0,0,0,0.92)';
      if (!(spoken && look.captionStyle === 'caixa')) context.strokeText(text, x, y);
      context.fillStyle = spoken && look.captionStyle === 'destaque' ? look.accent : '#ffffff';
      context.fillText(text, x, y);
      x += width + space;
    }
  });
  context.restore();
}

export function drawVideoFrame(context: CanvasRenderingContext2D, time: number, { timeline, pictures, look }: FrameInput): void {
  const scene = sceneAt(timeline, time);
  context.fillStyle = look.background;
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  if (!scene) return;

  const previous = scene.index > 0 ? timeline.scenes[scene.index - 1] : null;
  const fading = previous ? (time - scene.start) / CROSSFADE : 1;
  if (previous && fading < 1) {
    drawPicture(context, pictures[previous.index] ?? null, previous, time, look);
    context.globalAlpha = Math.max(0, fading);
  }
  drawPicture(context, pictures[scene.index] ?? null, scene, time, look);
  context.globalAlpha = 1;
  if (pictures.some(Boolean)) drawShade(context);

  drawHeadline(context, look);
  const caption = captionAt(timeline, time);
  if (caption) drawCaption(context, caption, time, look);
}
