// ffmpeg.wasm 폴백 인코더 (TRD 4.6). @ffmpeg/ffmpeg가 자체 워커에서 wasm을 돌리므로 메인 스레드는 막히지 않는다.
// 원본은 WORKERFS로 마운트해 wasm 메모리에 복사하지 않는다(500MB 영상도 메모리 두 배로 불어나지 않게).
import { FFmpeg, type FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { TimeRange } from '@/types/models';
import { createTimeMap, keptRanges } from '@/lib/core/edl';
import { AppError, throwIfAborted, toAppError } from '@/lib/errors';
import { ensureSubtitleFonts, SUBTITLE_FONT_TTF_URL } from '@/lib/fonts';
import { toAss } from '@/lib/subtitle/ass';
import { activeCueAt } from '@/lib/subtitle/model';
import { renderSubtitleToCanvas } from '@/lib/subtitle/render';
import { drawSourceFrame, type FrameView } from '@/lib/render/frame';
import { renderMosaicFrame } from '@/lib/vision/mosaicRender';
import type { Progress } from '@/lib/worker/protocol';
import { mimeFor } from '../presets';
import type { EncoderAdapter, RenderJob } from '../types';
import { buildFfmpegArgs, parseFfmpegTime } from './filters';

/** 이 렌더에 쓸 화면 비율 설정 */
function viewOf(job: RenderJob): FrameView {
  return {
    aspectMode: 'original', fillMode: 'blur', reframe: { x: 0.5, y: 0.5, scale: 1 },
    ...job.view, fallbackFit: job.output.fit,
  };
}

/**
 * 영상 전체에 걸린 하나의 배속. 클립마다 다르면 null.
 * ffmpeg 필터는 구간마다 다른 배속을 걸 수 없어서, 그럴 때는 기본 인코더(WebCodecs)가 처리한다.
 */
export function uniformSpeed(job: RenderJob): number | null {
  const spans = createTimeMap(job.edl, job.speeds ?? [], job.globalSpeed ?? 1).spans;
  if (spans.length === 0) return job.globalSpeed ?? 1;
  const first = spans[0].speed;
  return spans.every((s) => Math.abs(s.speed - first) < 0.001) ? first : null;
}

/** 모자이크 프레임을 JPEG로 구워 넘기는 방식은 wasm 메모리 한계 때문에 짧은 결과물만 가능 */
export const BAKE_LIMIT_MS = 3 * 60 * 1000;
/** 이 시간 동안 ffmpeg 로그가 한 줄도 없으면 멈춘 것으로 본다 */
const STALL_MS = 25_000;
/** core-mt는 스레드를 코어 수만큼 만들다 pthread 풀이 바닥나 교착되는 경우가 있어 상한을 둔다 */
const MT_DECODE_THREADS = '2';
const MT_ENCODE_THREADS = '4';

let instance: Promise<FFmpeg> | null = null;
let forceSingleThread = false;

class FfmpegStall extends Error {}

export function isMultiThread(): boolean {
  return !forceSingleThread && typeof self !== 'undefined' && self.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
}

export function loadFfmpeg(): Promise<FFmpeg> {
  if (instance) return instance;
  instance = (async () => {
    const ff = new FFmpeg();
    const origin = location.origin;
    const mt = isMultiThread();
    const base = `${origin}/${mt ? 'ffmpeg' : 'ffmpeg-st'}`;
    await ff.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      ...(mt ? { workerURL: `${base}/ffmpeg-core.worker.js` } : {}),
      classWorkerURL: `${origin}/ffmpeg/lib/worker.js`,
    });
    return ff;
  })().catch((e) => {
    instance = null;
    throw new AppError('ENCODE_FAILED', `예비 인코더(ffmpeg)를 불러오지 못했습니다. (${e instanceof Error ? e.message : String(e)})`, '새로고침 후 다시 시도해 주세요.');
  });
  return instance;
}

export function resetFfmpeg(): void {
  const current = instance;
  instance = null;
  void current?.then((ff) => ff.terminate()).catch(() => undefined);
}

function waitEvent(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new AppError('DECODE_FAILED')); };
    const cleanup = () => { target.removeEventListener(event, ok); target.removeEventListener('error', bad); };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener('error', bad, { once: true });
  });
}

async function bakeFrames(ff: FFmpeg, source: File, job: RenderJob, outMs: number, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void> {
  const { width: W, height: H, fps } = job.output;
  const view = viewOf(job);
  const timeMap = createTimeMap(job.edl, job.speeds ?? [], job.globalSpeed ?? 1);
  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await waitEvent(video, 'loadeddata');
    // 모자이크는 원본 좌표계에서 그려야 하므로 중간 화면에 먼저 그린다
    const zoom = view.aspectMode !== 'original' && view.fillMode === 'crop' ? Math.max(1, view.reframe.scale) : 1;
    const k = Math.min(1, Math.max(W / Math.max(1, video.videoWidth), H / Math.max(1, video.videoHeight)) * zoom);
    const stageW = Math.max(2, Math.round(video.videoWidth * k));
    const stageH = Math.max(2, Math.round(video.videoHeight * k));
    const out = new OffscreenCanvas(W, H);
    const ctx = out.getContext('2d');
    const stage = new OffscreenCanvas(stageW, stageH);
    const sctx = stage.getContext('2d');
    if (!ctx || !sctx) throw new AppError('ENCODE_FAILED', '그리기 화면(캔버스)을 만들 수 없습니다.');
    if (job.subtitles?.length) await ensureSubtitleFonts();
    const tracks = (job.mosaicTracks ?? []).filter((t) => t.enabled);
    const total = Math.max(1, Math.floor((outMs * fps) / 1000));
    await ff.createDir('/frames');
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      const tOut = Math.round((i * 1000) / fps);
      const src = timeMap.toSource(tOut) ?? 0;
      video.currentTime = src / 1000;
      await waitEvent(video, 'seeked');
      sctx.drawImage(video, 0, 0, stageW, stageH);
      renderMosaicFrame(sctx, tracks, src, job.mosaicHoldMs);
      drawSourceFrame(ctx, stage, stageW, stageH, W, H, view);
      const cue = job.style ? activeCueAt(job.subtitles ?? [], tOut) : undefined;
      if (cue && job.style) renderSubtitleToCanvas(ctx, cue, job.style, W);
      const blob = await out.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      await ff.writeFile(`/frames/${String(i).padStart(6, '0')}.jpg`, new Uint8Array(await blob.arrayBuffer()));
      onProgress({ phase: 'render', done: i, total, message: '모자이크 프레임을 굽는 중' });
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

/** 멀티스레드 코어에서만: 입력 디코드·출력 인코드 스레드 수에 상한을 둔다 */
function limitThreads(args: string[]): string[] {
  const output = args[args.length - 1];
  return ['-threads', MT_DECODE_THREADS, ...args.slice(0, -1), '-threads', MT_ENCODE_THREADS, output];
}

async function execWatched(ff: FFmpeg, args: string[], lastActivity: () => number): Promise<number> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      if (Date.now() - lastActivity() > STALL_MS) reject(new FfmpegStall('ffmpeg stalled'));
    }, 2000);
  });
  try {
    return await Promise.race([ff.exec(args), stalled]);
  } finally {
    clearInterval(timer);
  }
}

async function renderOnce(job: RenderJob, source: File, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Blob> {
  const ranges: TimeRange[] = keptRanges(job.edl);
  if (ranges.length === 0) throw new AppError('ENCODE_FAILED', '남은 구간이 없어 내보낼 것이 없습니다.', '타임라인에서 최소 한 구간을 살려 주세요.');
  const speed = uniformSpeed(job);
  if (speed === null) {
    throw new AppError(
      'ENCODE_FAILED',
      '예비 인코더(ffmpeg)는 클립마다 다른 배속을 처리하지 못합니다.',
      '배속을 “영상 전체”로 하나만 걸거나, Chrome·Edge의 기본 인코더로 내보내 주세요.',
    );
  }
  const outMs = Math.round(ranges.reduce((a, r) => a + r.endMs - r.startMs, 0) / (speed > 0 ? speed : 1));
  const format = job.output.format === 'gif' ? 'gif' : job.output.format === 'mp3' ? 'mp3' : 'mp4';
  const output = `/out.${format}`;
  const mosaicOn = format === 'mp4' && (job.mosaicTracks ?? []).some((t) => t.enabled && t.keyframes.length > 0);
  if (mosaicOn && outMs > BAKE_LIMIT_MS) {
    throw new AppError('ENCODE_FAILED', '예비 인코더(ffmpeg)로는 모자이크가 들어간 3분 초과 영상을 만들 수 없습니다.', 'Chrome·Edge의 기본 인코더로 내보내거나, 구간을 나눠 내보내 주세요.');
  }

  const mt = isMultiThread();
  const ff = await loadFfmpeg();
  const onAbort = () => resetFfmpeg();
  signal.addEventListener('abort', onAbort, { once: true });
  // 문제 해결용: localStorage에 editon.debug=1 이면 ffmpeg 로그를 콘솔에 남긴다 (GUIDE 7장)
  const debug = typeof localStorage !== 'undefined' && localStorage.getItem('editon.debug') === '1';
  let lastActivity = Date.now();
  const onLog = ({ message }: { message: string }) => {
    lastActivity = Date.now();
    if (debug) console.debug(`[ffmpeg] ${message}`);
    const t = parseFfmpegTime(message);
    if (t !== null) onProgress({ phase: 'render', done: Math.min(outMs, t), total: outMs });
  };
  ff.on('log', onLog);
  let mounted = false;
  let stalled = false;
  try {
    await ff.createDir('/input').catch(() => undefined);
    await ff.mount('WORKERFS' as FFFSType, { files: [source] }, '/input');
    mounted = true;
    const input = `/input/${source.name}`;

    let assPath: string | undefined;
    let fontsDir: string | undefined;
    let bakedFramesPattern: string | undefined;
    if (mosaicOn) {
      await bakeFrames(ff, source, job, outMs, onProgress, signal);
      bakedFramesPattern = '/frames/%06d.jpg';
    } else if (format === 'mp4' && job.subtitles?.length && job.style) {
      await ff.createDir('/fonts').catch(() => undefined);
      await ff.writeFile('/fonts/Pretendard.ttf', await fetchFile(SUBTITLE_FONT_TTF_URL));
      // TTF 내부 글꼴 이름은 "Pretendard Variable" — ASS가 이 이름으로 찾아야 번인된다
      const style = { ...job.style, fontFamily: job.style.fontFamily === 'Pretendard' ? 'Pretendard Variable' : job.style.fontFamily };
      await ff.writeFile('/sub.ass', toAss(job.subtitles, style, job.output.width, job.output.height));
      assPath = '/sub.ass';
      fontsDir = '/fonts';
    }

    const built = buildFfmpegArgs({
      input, output, ranges, width: job.output.width, height: job.output.height, fps: job.output.fps,
      fit: job.output.fit, format, hasAudio: job.hasAudio, bitrate: job.output.bitrate, assPath, fontsDir, bakedFramesPattern,
      // 구운 프레임에는 비율·배속이 이미 반영돼 있다. 소리는 여기서 배속을 맞춘다
      speed,
      pitchPreserve: job.pitchPreserve ?? true,
      bitrateMode: job.output.bitrateMode,
      view: bakedFramesPattern ? undefined : viewOf(job),
      srcWidth: job.sourceWidth,
      srcHeight: job.sourceHeight,
    });
    lastActivity = Date.now();
    const code = await execWatched(ff, mt ? limitThreads(built) : built, () => lastActivity);
    throwIfAborted(signal);
    if (code !== 0) throw new AppError('ENCODE_FAILED', `예비 인코더가 실패했습니다 (코드 ${code}).`, '해상도를 낮추거나 다른 형식으로 내보내 보세요.');
    const data = await ff.readFile(output);
    if (typeof data === 'string') throw new AppError('ENCODE_FAILED');
    onProgress({ phase: 'mux', done: 1, total: 1 });
    return new Blob([new Uint8Array(data)], { type: mimeFor(format) });
  } catch (e) {
    if (signal.aborted) throw new AppError('ABORTED');
    if (e instanceof FfmpegStall) {
      stalled = true;
      throw e;
    }
    throw toAppError(e, 'ENCODE_FAILED');
  } finally {
    signal.removeEventListener('abort', onAbort);
    ff.off('log', onLog);
    // 멈춘 인스턴스나 구운 프레임 수천 장이 남은 인스턴스는 정리보다 새로 띄우는 편이 빠르고 메모리도 확실히 돌려받는다
    if (stalled || mosaicOn) {
      resetFfmpeg();
    } else if (!signal.aborted) {
      await ff.deleteFile(output).catch(() => undefined);
      if (mounted) await ff.unmount('/input').catch(() => undefined);
    }
  }
}

export async function renderWithFfmpeg(job: RenderJob, source: File, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Blob> {
  try {
    return await renderOnce(job, source, onProgress, signal);
  } catch (e) {
    if (!(e instanceof FfmpegStall)) throw e;
    if (!forceSingleThread) {
      // 멀티스레드 코어가 교착되면 느리지만 안정적인 단일 스레드 코어로 한 번 더 — 실패해도 결과는 나오게 (PRD 8장)
      forceSingleThread = true;
      onProgress({ phase: 'render', done: 0, total: 1, message: '고속 모드가 멈춰 안정 모드로 다시 만드는 중' });
      return renderWithFfmpeg(job, source, onProgress, signal);
    }
    throw new AppError('ENCODE_FAILED', '예비 인코더가 응답하지 않습니다.', '해상도를 낮추거나 구간을 짧게 나눠 내보내 보세요.');
  }
}

export const ffmpegAdapter: EncoderAdapter = {
  id: 'ffmpeg-wasm',
  async isAvailable() {
    return typeof WebAssembly !== 'undefined';
  },
  render: renderWithFfmpeg,
};
