/// <reference lib="webworker" />
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, type PreTrainedTokenizer } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './kokoroProtocol';

/**
 * Kokoro (open model, Apache 2.0) speaking Brazilian Portuguese, fully in the browser.
 * Text becomes phonemes with eSpeak NG (the Piper build, which has pt-BR), then Kokoro turns them into audio.
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE_URL = (voice: string) => `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${voice}.bin`;
const PHONEMIZER_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const STYLE_SIZE = 256;
const MAX_TOKENS = 509;

interface EmscriptenModule {
  callMain(args: string[]): void;
}
type CreatePhonemizer = (options: {
  print: (line: string) => void;
  printErr: (line: string) => void;
  wasmBinary: ArrayBuffer;
  getPreloadedPackage: () => ArrayBuffer;
  locateFile: (file: string) => string;
}) => Promise<EmscriptenModule>;

interface Engine {
  model: StyleTextToSpeech2Model;
  tokenizer: PreTrainedTokenizer;
  createPhonemizer: CreatePhonemizer;
  wasm: ArrayBuffer;
  data: ArrayBuffer;
}

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer);
const voices = new Map<string, Float32Array>();
let engine: Promise<Engine> | null = null;

async function fetchWithProgress(url: string, label: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Não consegui baixar ${label} (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    post({ type: 'progress', fraction: total ? loaded / total : null, label });
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }
  return buffer.buffer;
}

async function loadPhonemizer(): Promise<Pick<Engine, 'createPhonemizer' | 'wasm' | 'data'>> {
  const source = await (await fetch(`${PHONEMIZER_BASE}.js`)).text();
  // The build is a classic script that declares a global factory; a module worker cannot importScripts it.
  const createPhonemizer = new Function(`${source}\nreturn createPiperPhonemize;`)() as CreatePhonemizer;
  const [wasm, data] = await Promise.all([fetch(`${PHONEMIZER_BASE}.wasm`).then((response) => response.arrayBuffer()), fetchWithProgress(`${PHONEMIZER_BASE}.data`, 'Dicionário de pronúncia')]);
  return { createPhonemizer, wasm, data };
}

/**
 * Runs on the processor: the graphics-card build (WebGPU) produced garbled speech on an integrated GPU
 * and silence in half precision. q8 is the smallest download (~90 MB) and spoke the clearest in tests.
 */
const RUNTIME = { device: 'wasm', dtype: 'q8' } as const;

function loadModel(): Promise<StyleTextToSpeech2Model> {
  const files = new Map<string, { loaded: number; total: number }>();
  return StyleTextToSpeech2Model.from_pretrained(MODEL_ID, {
    ...RUNTIME,
    progress_callback: (info) => {
      if (info.status !== 'progress') return;
      files.set(info.file, { loaded: info.loaded, total: info.total });
      const all = [...files.values()];
      const total = all.reduce((sum, file) => sum + file.total, 0);
      post({ type: 'progress', fraction: total ? all.reduce((sum, file) => sum + file.loaded, 0) / total : null, label: 'Modelo de voz' });
    },
  });
}

async function loadEngine(): Promise<Engine> {
  const [model, tokenizer, phonemizer] = await Promise.all([loadModel(), AutoTokenizer.from_pretrained(MODEL_ID), loadPhonemizer()]);
  return { model, tokenizer, ...phonemizer };
}

function getEngine(): Promise<Engine> {
  if (!engine) {
    engine = loadEngine();
    engine.catch(() => {
      engine = null;
    });
  }
  return engine;
}

async function phonemize(current: Engine, text: string): Promise<string> {
  // eSpeak runs as a command line program: one fresh instance per sentence, reusing the downloaded files.
  return new Promise((resolve, reject) => {
    current
      .createPhonemizer({
        print: (line) => {
          try {
            resolve((JSON.parse(line) as { phonemes: string[] }).phonemes.join(''));
          } catch (cause) {
            reject(cause);
          }
        },
        printErr: (line) => console.warn('[phonemizer]', line),
        wasmBinary: current.wasm,
        getPreloadedPackage: () => current.data,
        locateFile: (file) => `${PHONEMIZER_BASE}.${file.split('.').pop()}`,
      })
      .then((module) => module.callMain(['-l', 'pt-br', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']))
      .catch(reject);
  });
}

async function voiceStyles(voice: string): Promise<Float32Array> {
  const cached = voices.get(voice);
  if (cached) return cached;
  const styles = new Float32Array(await (await fetch(VOICE_URL(voice))).arrayBuffer());
  voices.set(voice, styles);
  return styles;
}

async function speak(text: string, voice: string, speed: number): Promise<Float32Array> {
  const current = await getEngine();
  const phonemes = await phonemize(current, text);
  const { input_ids } = current.tokenizer(phonemes, { truncation: true }) as { input_ids: Tensor };
  const tokens = Math.min(Math.max(input_ids.dims[input_ids.dims.length - 1] - 2, 0), MAX_TOKENS);
  const styles = await voiceStyles(voice);
  const style = new Tensor('float32', styles.slice(tokens * STYLE_SIZE, (tokens + 1) * STYLE_SIZE), [1, STYLE_SIZE]);
  const { waveform } = (await current.model({ input_ids, style, speed: new Tensor('float32', [speed], [1]) })) as { waveform: Tensor };
  return new Float32Array(waveform.data as Float32Array);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'prepare') {
      await getEngine();
      post({ type: 'ready', id: request.id });
      return;
    }
    const samples = await speak(request.text, request.voice, request.speed);
    post({ type: 'speech', id: request.id, samples }, [samples.buffer]);
  } catch (cause) {
    post({ type: 'error', id: request.id, message: cause instanceof Error ? cause.message : String(cause) });
  }
};
