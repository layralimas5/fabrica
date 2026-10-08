import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { videoTools } from '../app/videoTools';
import { makeVideo, previewVoice, type VideoStage } from '../application/video/makeVideo';
import type { LoadProgress } from '../application/video/ports';
import { ensureFont } from '../render/fonts';
import { drawVideoFrame } from '../render/videoFrame';
import type { VideoLook } from '../domain/video/look';
import { parseVideoScript } from '../domain/video/videoScript';
import { decodePicture, pictureFor, type PictureSource } from './scenePictures';

export interface MusicChoice {
  file: File;
  volume: number;
}

export interface VideoResult {
  url: string;
  blob: Blob;
  duration: number;
}

export type MakerStatus = { kind: 'idle' } | { kind: 'working'; stage: VideoStage | null } | { kind: 'done'; result: VideoResult } | { kind: 'error'; message: string };

export interface VoiceSample {
  playing: boolean;
  error: string | null;
  /** Set while the voice model downloads the first time. */
  loading: LoadProgress | null;
}

export interface VideoSettings {
  script: string;
  pictures: (PictureSource | null)[];
  fallbackPicture: PictureSource | null;
  voiceId: string;
  speed: number;
  look: VideoLook;
  music: MusicChoice | null;
}

/** Generates the video and the voice sample; keeps the result URL alive until the next one. */
export function useVideoMaker(settings: VideoSettings) {
  const { assets } = useServices();
  const [status, setStatus] = useState<MakerStatus>({ kind: 'idle' });
  const [sample, setSample] = useState<VoiceSample>({ playing: false, error: null, loading: null });
  const abort = useRef<AbortController | null>(null);
  const scenes = useMemo(() => parseVideoScript(settings.script), [settings.script]);
  const resultUrl = status.kind === 'done' ? status.result.url : null;

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const generate = useCallback(async () => {
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: 'working', stage: null });
    try {
      const { speech, encoder } = videoTools();
      if (!(await encoder.supported())) throw new Error('Este navegador não grava MP4. Abra a Fábrica no Chrome ou no Edge atualizados.');
      const [pictures] = await Promise.all([
        Promise.all(scenes.map((_, index) => decodePicture(assets, pictureFor(settings.pictures, settings.fallbackPicture, index)))),
        ensureFont(settings.look.font, [settings.look.weight]),
      ]);
      const made = await makeVideo(speech, encoder, {
        scenes,
        voiceId: settings.voiceId,
        speed: settings.speed,
        music: settings.music,
        painterFor: (timeline) => (context, time) => drawVideoFrame(context, time, { timeline, pictures, look: settings.look }),
        onStage: (stage) => setStatus({ kind: 'working', stage }),
        signal: controller.signal,
      });
      setStatus({ kind: 'done', result: { url: URL.createObjectURL(made.blob), blob: made.blob, duration: made.duration } });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setStatus({ kind: 'idle' });
      else setStatus({ kind: 'error', message: errorMessage(cause) });
    } finally {
      abort.current = null;
    }
  }, [assets, scenes, settings]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  const listen = useCallback(async () => {
    const first = scenes[0]?.sentences[0]?.text;
    if (!first) return;
    setSample({ playing: true, error: null, loading: null });
    try {
      const { speech } = videoTools();
      const samples = await previewVoice(speech, first, settings.voiceId, settings.speed, (loading) => setSample({ playing: true, error: null, loading }));
      setSample({ playing: true, error: null, loading: null });
      const context = new AudioContext();
      const buffer = context.createBuffer(1, samples.length, speech.sampleRate);
      buffer.copyToChannel(new Float32Array(samples), 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        void context.close();
        setSample({ playing: false, error: null, loading: null });
      };
      source.start();
    } catch (cause) {
      setSample({ playing: false, error: errorMessage(cause), loading: null });
    }
  }, [scenes, settings.voiceId, settings.speed]);

  return { scenes, status, generate, cancel, listen, sample, reset: () => setStatus({ kind: 'idle' }) };
}

export function stageLabel(stage: VideoStage | null): { label: string; fraction: number | null } {
  if (!stage) return { label: 'Preparando', fraction: null };
  if (stage.step === 'loading') return { label: `Baixando a voz (só na primeira vez): ${stage.progress.label}`, fraction: stage.progress.fraction };
  if (stage.step === 'voice') return { label: `Gravando a narração: frase ${Math.min(stage.done + 1, stage.total)} de ${stage.total}`, fraction: stage.total ? stage.done / stage.total : null };
  return { label: 'Montando o vídeo', fraction: stage.fraction };
}
