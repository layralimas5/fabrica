import { AudioBufferSource, BufferTarget, CanvasSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, QUALITY_HIGH } from 'mediabunny';
import type { EncodeRequest, VideoEncoderPort } from '../../application/video/ports';

const OUTPUT_SAMPLE_RATE = 48000;
const MUSIC_FADE_SECONDS = 1.2;

/** Mixes the narration with the optional song into one stereo track at the rate AAC expects. */
async function mixAudio(request: EncodeRequest): Promise<AudioBuffer> {
  const length = Math.ceil(request.duration * OUTPUT_SAMPLE_RATE);
  const context = new OfflineAudioContext(2, length, OUTPUT_SAMPLE_RATE);

  const { samples, sampleRate } = request.narration;
  const voiceBuffer = context.createBuffer(1, samples.length, sampleRate);
  voiceBuffer.copyToChannel(new Float32Array(samples), 0);
  const voice = context.createBufferSource();
  voice.buffer = voiceBuffer;
  voice.connect(context.destination);
  voice.start(0);

  if (request.music) {
    const song = await context.decodeAudioData(await request.music.file.arrayBuffer()).catch(() => {
      throw new Error('Não consegui ler a música. Use um arquivo MP3, M4A ou WAV.');
    });
    const source = context.createBufferSource();
    source.buffer = song;
    source.loop = true;
    const gain = context.createGain();
    const end = request.duration;
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(request.music.volume, 0.6);
    gain.gain.setValueAtTime(request.music.volume, Math.max(0.6, end - MUSIC_FADE_SECONDS));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(context.destination);
    source.start(0);
  }

  return context.startRendering();
}

export class Mp4Encoder implements VideoEncoderPort {
  async supported(): Promise<boolean> {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return false;
    const [video, audio] = await Promise.all([getFirstEncodableVideoCodec(['avc'], { width: 1080, height: 1920 }), getFirstEncodableAudioCodec(['aac'], { numberOfChannels: 2, sampleRate: OUTPUT_SAMPLE_RATE })]);
    return video !== null && audio !== null;
  }

  async encode(request: EncodeRequest): Promise<Blob> {
    if (!(await this.supported())) throw new Error('Este navegador não grava MP4. Use o Chrome ou o Edge atualizados.');

    const audio = await mixAudio(request);
    const canvas = document.createElement('canvas');
    canvas.width = request.width;
    canvas.height = request.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador não suporta canvas 2D.');

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    const sound = new AudioBufferSource({ codec: 'aac', bitrate: 160_000 });
    output.addVideoTrack(video, { frameRate: request.fps });
    output.addAudioTrack(sound);
    await output.start();

    try {
      await sound.add(audio);
      const frames = Math.ceil(request.duration * request.fps);
      const frameDuration = 1 / request.fps;
      for (let frame = 0; frame < frames; frame++) {
        if (request.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
        const time = frame * frameDuration;
        request.drawFrame(context, time);
        await video.add(time, frameDuration);
        request.onProgress?.((frame + 1) / frames);
      }
      await output.finalize();
    } catch (cause) {
      await output.cancel().catch(() => undefined);
      throw cause;
    }

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('O vídeo não foi gerado.');
    return new Blob([buffer], { type: 'video/mp4' });
  }
}
