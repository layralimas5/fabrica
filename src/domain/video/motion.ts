/** Slow camera move over a still picture ("Ken Burns"), so a photo feels like footage. */

export interface Framing {
  /** 1 = the picture just covers the frame. */
  scale: number;
  /** Shift of the picture centre, as a fraction of the frame size (-0.5..0.5). */
  offsetX: number;
  offsetY: number;
}

const MOVES: ((progress: number) => Framing)[] = [
  (p) => ({ scale: 1 + 0.1 * p, offsetX: 0, offsetY: 0 }),
  (p) => ({ scale: 1.1 - 0.1 * p, offsetX: 0, offsetY: 0 }),
  (p) => ({ scale: 1.08, offsetX: -0.03 + 0.06 * p, offsetY: 0 }),
  (p) => ({ scale: 1.04 + 0.06 * p, offsetX: 0, offsetY: 0.025 - 0.05 * p }),
];

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Neighbour scenes never repeat the same move. `progress` goes 0..1 over the scene. */
export function framingFor(sceneIndex: number, progress: number, animated = true): Framing {
  if (!animated) return { scale: 1, offsetX: 0, offsetY: 0 };
  const clamped = Math.min(1, Math.max(0, progress));
  return MOVES[sceneIndex % MOVES.length](easeInOut(clamped));
}

/** Source rectangle of an image drawn to cover a frame, after the framing is applied. */
export function coverRect(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number, framing: Framing) {
  const cover = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * framing.scale;
  const width = frameWidth / cover;
  const height = frameHeight / cover;
  const maxX = (imageWidth - width) / 2;
  const maxY = (imageHeight - height) / 2;
  const x = maxX - framing.offsetX * imageWidth;
  const y = maxY - framing.offsetY * imageHeight;
  return { sx: Math.min(Math.max(x, 0), imageWidth - width), sy: Math.min(Math.max(y, 0), imageHeight - height), sw: width, sh: height };
}
