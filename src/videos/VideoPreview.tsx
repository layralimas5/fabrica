import { useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { estimatedTimeline } from '../application/video/makeVideo';
import { VIDEO_HEIGHT, VIDEO_WIDTH, type VideoLook } from '../domain/video/look';
import type { VideoScene } from '../domain/video/videoScript';
import { ensureFont } from '../render/fonts';
import { drawVideoFrame, type ScenePicture } from '../render/videoFrame';
import { decodePicture, pictureFor, type PictureSource } from './scenePictures';

interface VideoPreviewProps {
  scenes: VideoScene[];
  pictures: (PictureSource | null)[];
  fallbackPicture: PictureSource | null;
  look: VideoLook;
  speed: number;
}

const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Still frame of any moment, timed by an estimate of the voice: shows the look before generating anything. */
export function VideoPreview({ scenes, pictures, fallbackPicture, look, speed }: VideoPreviewProps) {
  const { assets } = useServices();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0.6);
  const [decoded, setDecoded] = useState<ScenePicture[]>([]);
  const [fontReady, setFontReady] = useState(0);
  const timeline = useMemo(() => (scenes.length ? estimatedTimeline(scenes, speed) : null), [scenes, speed]);
  const sources = useMemo(() => scenes.map((_, index) => pictureFor(pictures, fallbackPicture, index)), [scenes, pictures, fallbackPicture]);

  useEffect(() => {
    let active = true;
    Promise.all(sources.map((source) => decodePicture(assets, source).catch(() => null))).then((bitmaps) => active && setDecoded(bitmaps));
    return () => {
      active = false;
    };
  }, [assets, sources]);

  useEffect(() => {
    let active = true;
    void ensureFont(look.font, [look.weight]).then(() => active && setFontReady((count) => count + 1));
    return () => {
      active = false;
    };
  }, [look.font, look.weight]);

  const clampedTime = timeline ? Math.min(time, timeline.duration) : 0;

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    if (!timeline) {
      context.fillStyle = look.background;
      context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      return;
    }
    drawVideoFrame(context, clampedTime, { timeline, pictures: decoded, look });
  }, [timeline, decoded, look, clampedTime, fontReady]);

  return (
    <figure className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        role="img"
        aria-label="Prévia de um quadro do vídeo"
        className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded-2xl bg-subtle shadow-sm ring-1 ring-line"
      />
      {timeline && (
        <div className="mx-auto flex w-full max-w-[300px] items-center gap-3">
          <label htmlFor="preview-time" className="sr-only">
            Momento da prévia
          </label>
          <input
            id="preview-time"
            type="range"
            min={0}
            max={timeline.duration}
            step={0.05}
            value={clampedTime}
            onChange={(event) => setTime(Number(event.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
            {formatSeconds(clampedTime)} / {formatSeconds(timeline.duration)}
          </span>
        </div>
      )}
      <figcaption className="text-center text-[11px] text-faint">Prévia com o tempo estimado. O vídeo final segue o ritmo real da voz.</figcaption>
    </figure>
  );
}
