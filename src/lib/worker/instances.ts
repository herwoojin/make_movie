// 워커 싱글턴. new URL(...)은 반드시 인라인 문자열이어야 번들러가 워커 파일을 찾는다 (GUIDE 3.4).
import type { AudioWorkerApi } from '@/workers/audio.worker';
import type { EncodeWorkerApi } from '@/workers/encode.worker';
import type { GifWorkerApi } from '@/workers/gif.worker';
import type { StorageWorkerApi } from '@/workers/storage.worker';
import type { SttWorkerApi } from '@/workers/stt.worker';
import type { VisionWorkerApi } from '@/workers/vision.worker';
import { WorkerClient } from './client';

let audio: WorkerClient<AudioWorkerApi> | null = null;
let stt: WorkerClient<SttWorkerApi> | null = null;
let vision: WorkerClient<VisionWorkerApi> | null = null;
let encode: WorkerClient<EncodeWorkerApi> | null = null;
let storage: WorkerClient<StorageWorkerApi> | null = null;
let gif: WorkerClient<GifWorkerApi> | null = null;

export function audioWorker(): WorkerClient<AudioWorkerApi> {
  audio ??= new WorkerClient(new Worker(new URL('../../workers/audio.worker.ts', import.meta.url), { type: 'module' }), 'audio');
  return audio;
}

export function sttWorker(): WorkerClient<SttWorkerApi> {
  stt ??= new WorkerClient(new Worker(new URL('../../workers/stt.worker.ts', import.meta.url), { type: 'module' }), 'stt');
  return stt;
}

export function visionWorker(): WorkerClient<VisionWorkerApi> {
  vision ??= new WorkerClient(new Worker(new URL('../../workers/vision.worker.ts', import.meta.url), { type: 'module' }), 'vision');
  return vision;
}

export function encodeWorker(): WorkerClient<EncodeWorkerApi> {
  encode ??= new WorkerClient(new Worker(new URL('../../workers/encode.worker.ts', import.meta.url), { type: 'module' }), 'encode');
  return encode;
}

export function storageWorker(): WorkerClient<StorageWorkerApi> {
  storage ??= new WorkerClient(new Worker(new URL('../../workers/storage.worker.ts', import.meta.url), { type: 'module' }), 'storage');
  return storage;
}

export function gifWorker(): WorkerClient<GifWorkerApi> {
  gif ??= new WorkerClient(new Worker(new URL('../../workers/gif.worker.ts', import.meta.url), { type: 'module' }), 'gif');
  return gif;
}

/** 음성 인식 모델(GPU 메모리 수백 MB)을 다 쓴 뒤 해제하거나, 멈춘 워커를 강제로 끝낼 때 */
export function terminateWorker(name: 'audio' | 'stt' | 'vision' | 'encode' | 'storage' | 'gif'): void {
  const table = { audio, stt, vision, encode, storage, gif };
  table[name]?.terminate();
  if (name === 'audio') audio = null;
  if (name === 'stt') stt = null;
  if (name === 'vision') vision = null;
  if (name === 'encode') encode = null;
  if (name === 'storage') storage = null;
  if (name === 'gif') gif = null;
}
