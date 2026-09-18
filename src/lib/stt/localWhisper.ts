// 브라우저 내장 Whisper (transformers.js). stt.worker 안에서만 쓴다.
// transformers.js는 webpack으로 묶지 않는다: ONNX 런타임 번들의 import.meta 때문에 Next의 워커 청크 압축이 실패하므로,
// public/vendor/transformers 에 self-host한 자체 완결 ESM 빌드를 런타임에 불러온다(ORT wasm도 같은 곳에서).
import { AppError, throwIfAborted } from '@/lib/errors';
import type { SttAdapter, SttResult, SttWord } from './types';

// 단어 단위 타임스탬프에는 cross-attention 정렬 헤드가 포함된 _timestamped 변환본이 필요하다
export const WHISPER_MODEL = 'onnx-community/whisper-base_timestamped';

export type WhisperSize = 'tiny' | 'base' | 'small';

/** 크기가 커질수록 정확하지만 내려받는 양과 시간이 늘어난다 (F-07-3) */
export const WHISPER_MODELS: Record<WhisperSize, { repo: string; label: string; downloadMb: number; note: string }> = {
  tiny: { repo: 'onnx-community/whisper-tiny_timestamped', label: 'Whisper tiny', downloadMb: 45, note: '가장 빠름 · 정확도 낮음' },
  base: { repo: WHISPER_MODEL, label: 'Whisper base (권장)', downloadMb: 85, note: '속도와 정확도의 균형' },
  small: { repo: 'onnx-community/whisper-small_timestamped', label: 'Whisper small', downloadMb: 250, note: '가장 정확 · 오래 걸림' },
};
export const CHUNK_SECONDS = 30;
export const TRANSFORMERS_BASE = '/vendor/transformers/';
const SAMPLE_RATE = 16_000;

interface AsrChunk { text: string; timestamp: [number, number | null] }
interface AsrOutput { text: string; chunks?: AsrChunk[] }
type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput | AsrOutput[]>;
interface ProgressInfo { status: string; file?: string; loaded?: number; total?: number }

interface TransformersModule {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<AsrPipeline>;
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    backends: { onnx: { wasm?: { wasmPaths?: string } } };
  };
}

const loaded = new Map<string, Promise<AsrPipeline>>();
let downloadListener: ((loaded: number, total: number) => void) | undefined;

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function importTransformers(): Promise<TransformersModule> {
  const base = `${self.location.origin}${TRANSFORMERS_BASE}`;
  const mod = (await import(/* webpackIgnore: true */ `${base}transformers.min.js`)) as TransformersModule;
  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = true;
  mod.env.backends.onnx.wasm = { ...mod.env.backends.onnx.wasm, wasmPaths: base };
  return mod;
}

function loadPipeline(model: string): Promise<AsrPipeline> {
  const cached = loaded.get(model);
  if (cached) return cached;
  const files = new Map<string, { loaded: number; total: number }>();
  const onProgress = (info: ProgressInfo) => {
    if (info.status !== 'progress' || !info.file) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    downloadListener?.(loaded, total);
  };
  const task = (async () => {
    try {
      const { pipeline } = await importTransformers();
      const webgpu = await hasWebGpu();
      return await pipeline('automatic-speech-recognition', model, {
        device: webgpu ? 'webgpu' : 'wasm',
        // WebGPU에서는 인코더 fp32 + 디코더 q4가 속도·정확도 균형이 가장 좋다
        dtype: webgpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: onProgress,
      });
    } catch (e) {
      loaded.delete(model);
      throw new AppError('STT_MODEL_LOAD_FAILED', `음성 인식 모델을 불러오지 못했습니다. (${e instanceof Error ? e.message : String(e)})`);
    }
  })();
  loaded.set(model, task);
  return task;
}

function toMs(sec: number | null | undefined, offsetMs: number): number {
  return Math.round((sec ?? 0) * 1000) + offsetMs;
}

export const localWhisperAdapter: SttAdapter = {
  id: 'local-whisper',
  displayName: '브라우저 내장 Whisper',
  requiresApiKey: false,
  sendsAudioToServer: false,
  async isAvailable() {
    return typeof WebAssembly !== 'undefined';
  },
  async transcribe(pcm, { language = 'korean', model, onProgress, onDownload, signal }): Promise<SttResult> {
    downloadListener = onDownload;
    const asr = await loadPipeline(model || WHISPER_MODEL);
    throwIfAborted(signal);
    const chunkSize = CHUNK_SECONDS * SAMPLE_RATE;
    const chunks = Math.max(1, Math.ceil(pcm.length / chunkSize));
    const words: SttWord[] = [];
    const segments: SttResult['segments'] = [];

    // 30초 단위로 직접 나눠 돌려야 청크별 진행률을 보고하고 중간에 취소할 수 있다
    for (let c = 0; c < chunks; c++) {
      throwIfAborted(signal);
      const offsetMs = Math.round((c * chunkSize * 1000) / SAMPLE_RATE);
      const slice = pcm.subarray(c * chunkSize, Math.min(pcm.length, (c + 1) * chunkSize));
      if (slice.length < SAMPLE_RATE / 4) continue;
      const raw = await asr(slice, { return_timestamps: 'word', language, task: 'transcribe' });
      const out = Array.isArray(raw) ? raw[0] : raw;
      const chunkWords = (out?.chunks ?? [])
        .map((w) => ({ text: w.text.trim(), start: toMs(w.timestamp[0], offsetMs), end: toMs(w.timestamp[1] ?? w.timestamp[0], offsetMs) }))
        .filter((w) => w.text.length > 0)
        .map((w) => ({ ...w, end: Math.max(w.end, w.start + 1) }));
      words.push(...chunkWords);
      if (out?.text?.trim() && chunkWords.length) {
        segments.push({ start: chunkWords[0].start, end: chunkWords[chunkWords.length - 1].end, text: out.text.trim() });
      }
      onProgress?.((c + 1) / chunks);
    }
    return { words, segments, language: language === 'korean' ? 'ko' : language };
  },
};
