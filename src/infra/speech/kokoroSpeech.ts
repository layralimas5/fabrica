import type { LoadProgress, SpeechSynthesizer, VoiceOption } from '../../application/video/ports';
import type { WorkerRequest, WorkerResponse } from './kokoroProtocol';

const VOICES: readonly VoiceOption[] = [
  { id: 'pf_dora', label: 'Dora (feminina)' },
  { id: 'pm_alex', label: 'Alex (masculina)' },
  { id: 'pm_santa', label: 'Santa (masculina, grave)' },
];

type Pending = { resolve: (value: Float32Array | null) => void; reject: (error: Error) => void };

/** Runs the voice model in a worker so the screen keeps responding while it speaks. */
export class KokoroSpeech implements SpeechSynthesizer {
  readonly voices = VOICES;
  readonly sampleRate = 24000;
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private progressListener: ((progress: LoadProgress) => void) | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./kokoroWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
    worker.onerror = (event) => {
      const error = new Error(event.message || 'O gerador de voz parou.');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private handle(message: WorkerResponse): void {
    if (message.type === 'progress') {
      this.progressListener?.({ fraction: message.fraction, label: message.label });
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === 'error') pending.reject(new Error(message.message));
    else pending.resolve(message.type === 'speech' ? message.samples : null);
  }

  private request(build: (id: number) => WorkerRequest): Promise<Float32Array | null> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ensureWorker().postMessage(build(id));
    });
  }

  async prepare(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    this.progressListener = onProgress ?? null;
    try {
      await this.request((id) => ({ type: 'prepare', id }));
    } finally {
      this.progressListener = null;
    }
  }

  async synthesize(text: string, voiceId: string, speed: number): Promise<Float32Array> {
    const samples = await this.request((id) => ({ type: 'speak', id, text, voice: voiceId, speed }));
    if (!samples) throw new Error('A voz voltou vazia.');
    return samples;
  }
}
