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
type AsrPipeline = ((audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput | AsrOutput[]>) & { tokenizer: unknown };
interface ProgressInfo { status: string; file?: string; loaded?: number; total?: number }

interface StreamerOptions {
  skip_prompt?: boolean;
  callback_function?: (text: string) => void;
  token_callback_function?: (tokens: bigint[]) => void;
}

interface TransformersModule {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<AsrPipeline>;
  WhisperTextStreamer: new (tokenizer: unknown, options: StreamerOptions) => unknown;
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    backends: { onnx: { wasm?: { wasmPaths?: string } } };
  };
}

const loaded = new Map<string, Promise<AsrPipeline>>();
let transformers: Promise<TransformersModule> | null = null;
let downloadListener: ((loaded: number, total: number) => void) | undefined;
let expectedBytes = 0;

/** 30초 구간 하나에서 보통 나오는 토큰 수 — 구간 안에서도 막대가 조금씩 움직이게 하는 어림값 */
const TOKENS_PER_CHUNK = 80;

/**
 * 전체 진행 비율. 구간이 끝날 때만 올라가면 한참 멈춰 보이므로,
 * 지금 구간에서 알아들은 토큰 수만큼 조금씩 올린다(구간 끝 직전에서 멈추고, 구간이 끝나야 넘어간다).
 */
export function transcribeRatio(chunk: number, chunks: number, tokens: number, perChunk = TOKENS_PER_CHUNK): number {
  const n = Math.max(1, chunks);
  const inside = Math.min(0.95, Math.max(0, tokens) / Math.max(1, perChunk));
  return Math.min(1, (Math.max(0, chunk) + inside) / n);
}

/**
 * 모델 내려받기 진행.
 * 파일이 여러 개(설정·토크나이저·인코더·디코더)라, 작은 설정 파일이 먼저 다 받아지면 "100%"가 됐다가
 * 큰 파일이 시작되면서 다시 떨어진다. 그래서 분모는 항상 "모델 전체 크기 어림값"과 실제 합계 중 큰 쪽을 쓴다.
 * 서버가 파일 크기를 안 알려 줘도(content-length 없음) 같은 이유로 어림값이 분모가 된다.
 */
export function downloadTotals(files: Iterable<{ loaded: number; total: number }>, expected: number): { loaded: number; total: number } {
  let loadedSum = 0;
  let totalSum = 0;
  let unknown = false;
  for (const f of files) {
    loadedSum += f.loaded;
    totalSum += f.total;
    if (!f.total) unknown = true;
  }
  const total = Math.max(totalSum, expected, loadedSum, 1);
  // 전체 크기를 확실히 모르면(어림값이 더 크거나 크기 모르는 파일이 있으면) 끝나기 전에 100%를 찍지 않는다
  const sure = !unknown && totalSum >= expected;
  return { loaded: sure ? loadedSum : Math.min(loadedSum, total * 0.99), total };
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

function importTransformers(): Promise<TransformersModule> {
  transformers ??= (async () => {
    const base = `${self.location.origin}${TRANSFORMERS_BASE}`;
    const mod = (await import(/* webpackIgnore: true */ `${base}transformers.min.js`)) as TransformersModule;
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    mod.env.backends.onnx.wasm = { ...mod.env.backends.onnx.wasm, wasmPaths: base };
    return mod;
  })();
  return transformers;
}

function loadPipeline(model: string): Promise<AsrPipeline> {
  const cached = loaded.get(model);
  if (cached) return cached;
  const files = new Map<string, { loaded: number; total: number }>();
  const onProgress = (info: ProgressInfo) => {
    if (info.status !== 'progress' || !info.file) return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
    const sum = downloadTotals(files.values(), expectedBytes);
    downloadListener?.(sum.loaded, sum.total);
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
  async transcribe(pcm, { language = 'korean', model, onProgress, onDownload, onPartial, expectedDownloadBytes, signal }): Promise<SttResult> {
    downloadListener = onDownload;
    expectedBytes = expectedDownloadBytes ?? 0;
    const asr = await loadPipeline(model || WHISPER_MODEL);
    const { WhisperTextStreamer } = await importTransformers();
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
      const toMsChunk = offsetMs + Math.round((slice.length * 1000) / SAMPLE_RATE);
      let heard = '';
      let tokens = 0;
      const report = (final = false) => onPartial?.({
        chunk: c, chunks, fromMs: offsetMs, toMs: toMsChunk, text: heard.trim(),
        ratio: final ? (c + 1) / chunks : transcribeRatio(c, chunks, tokens), final,
      });
      report();
      // 알아들은 말을 토큰이 나오는 대로 흘려보낸다 — 화면에 실제로 인식 중인 문장이 보인다
      const streamer = new WhisperTextStreamer(asr.tokenizer, {
        skip_prompt: true,
        token_callback_function: () => { tokens += 1; },
        callback_function: (text: string) => { heard += text; report(); },
      });
      // 'auto'면 언어를 지정하지 않아 Whisper가 스스로 알아낸다
      const langOpt = language && language !== 'auto' ? { language } : {};
      const raw = await asr(slice, { return_timestamps: 'word', ...langOpt, task: 'transcribe', streamer });
      const out = Array.isArray(raw) ? raw[0] : raw;
      const chunkWords = (out?.chunks ?? [])
        .map((w) => ({ text: w.text.trim(), start: toMs(w.timestamp[0], offsetMs), end: toMs(w.timestamp[1] ?? w.timestamp[0], offsetMs) }))
        .filter((w) => w.text.length > 0)
        .map((w) => ({ ...w, end: Math.max(w.end, w.start + 1) }));
      words.push(...chunkWords);
      if (out?.text?.trim() && chunkWords.length) {
        segments.push({ start: chunkWords[0].start, end: chunkWords[chunkWords.length - 1].end, text: out.text.trim() });
      }
      if (onPartial) {
        // 구간이 끝나면 완성된 문장을 한 번 더 보낸다 (다음 구간이 시작될 때까지 화면에 남는다)
        heard = out?.text?.trim() || heard;
        report(true);
      } else {
        onProgress?.((c + 1) / chunks);
      }
    }
    return { words, segments, language: language === 'korean' ? 'ko' : language };
  },
};
