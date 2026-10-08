export type WorkerRequest = { type: 'prepare'; id: number } | { type: 'speak'; id: number; text: string; voice: string; speed: number };

export type WorkerResponse =
  | { type: 'progress'; fraction: number | null; label: string }
  | { type: 'ready'; id: number }
  | { type: 'speech'; id: number; samples: Float32Array }
  | { type: 'error'; id: number; message: string };
