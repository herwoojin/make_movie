// 내보내기 오케스트레이터: 인코더 자동 선택 → 렌더 → 실패 시 폴백 → ExportJob 기록.
import { nanoid } from 'nanoid';
import type { EncoderId, ExportJob, MediaAsset, Project } from '@/types/models';
import type { EditorDoc } from '@/types/editor';
import { clipSpeedRanges } from '@/lib/core/clips';
import { keptRanges, outputDurationMs } from '@/lib/core/edl';
import { clipsToCues } from '@/lib/subtitle/clipCues';
import { checkEnv } from '@/lib/env/capabilities';
import { toAppError } from '@/lib/errors';
import { isMp4Like } from '@/lib/media/probeClient';
import type { EncoderPreference } from '@/lib/settings';
import { getDb } from '@/lib/storage/db';
import { deleteDir, paths, readFile } from '@/lib/storage/opfs';
import { baseName } from '@/lib/utils';
import { encodeWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';
import { exportWavRanges } from './audioOnly';
import { estimateFfmpegMs } from './ffmpeg/filters';
import { getPreset, resolveFps, resolveOutputSize, type ExportPresetDef } from './presets';
import type { RenderJob } from './types';

export type UsedEncoder = EncoderId | 'native';

export interface ExportOptions {
  presetId: string;
  encoderPref: EncoderPreference;
  burnSubtitles: boolean;
  applyMosaic: boolean;
  mosaicHoldMs: number;
}

export interface ExportRequest extends ExportOptions {
  project: Project;
  asset: MediaAsset;
  source: File;
  doc: EditorDoc;
  onProgress: (p: Progress) => void;
  onEncoder?: (encoder: UsedEncoder, reason?: string) => void;
  signal: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  encoder: UsedEncoder;
  jobId: string;
  elapsedMs: number;
}

export function buildRenderJob(asset: MediaAsset, doc: EditorDoc, opts: ExportOptions): { job: RenderJob; preset: ExportPresetDef } {
  const preset = getPreset(opts.presetId);
  const size = resolveOutputSize(preset, asset.width ?? 0, asset.height ?? 0, doc.view.aspectMode);
  const speeds = clipSpeedRanges(doc.clips);
  // 자막은 클립에서 만든다 (v2). 결과물 시간으로 옮겨 굽는다.
  const cues = clipsToCues(doc.clips, doc.edl, speeds, doc.view.globalSpeed, { leadMs: doc.view.captionLeadMs });
  const job: RenderJob = {
    edl: doc.edl,
    speeds,
    globalSpeed: doc.view.globalSpeed,
    pitchPreserve: doc.view.pitchPreserve,
    view: { aspectMode: doc.view.aspectMode, fillMode: doc.view.fillMode, reframe: doc.view.reframe },
    subtitles: opts.burnSubtitles && cues.length ? cues : undefined,
    style: opts.burnSubtitles && cues.length ? doc.style : undefined,
    mosaicTracks: opts.applyMosaic ? doc.tracks.filter((t) => t.enabled) : undefined,
    mosaicHoldMs: opts.mosaicHoldMs,
    sourceWidth: asset.width ?? 0,
    sourceHeight: asset.height ?? 0,
    sourceFps: asset.fps ?? 30,
    hasAudio: (asset.audioCodec ?? 'unknown') !== 'none',
    output: {
      width: size.width,
      height: size.height,
      fps: resolveFps(preset, asset.fps ?? 30),
      bitrate: preset.bitrate,
      format: preset.format === 'wav' ? 'wav' : preset.format === 'gif' ? 'gif' : 'mp4',
      fit: preset.fit,
    },
  };
  return { job, preset };
}

export function pickEncoder(
  pref: EncoderPreference, asset: Pick<MediaAsset, 'fileName' | 'mimeType'>, format: RenderJob['output']['format'],
  speed?: { changed: boolean; pitchPreserve: boolean; uniform: boolean },
): { encoder: UsedEncoder; reason?: string } {
  if (format === 'wav') return { encoder: 'native' };
  if (pref === 'ffmpeg-wasm') return { encoder: 'ffmpeg-wasm', reason: '설정에서 예비 인코더(ffmpeg)를 선택했습니다.' };
  // 음정을 유지한 배속은 ffmpeg atempo로만 된다 (WebCodecs 경로는 톤이 함께 바뀐다)
  if (speed?.changed && speed.pitchPreserve && speed.uniform) {
    return { encoder: 'ffmpeg-wasm', reason: '음정을 유지한 채로 배속을 걸기 위해 예비 인코더를 씁니다.' };
  }
  if (!checkEnv().webCodecs) return { encoder: 'ffmpeg-wasm', reason: '이 브라우저는 하드웨어 영상 처리(WebCodecs)를 지원하지 않습니다.' };
  if (!isMp4Like({ name: asset.fileName, type: asset.mimeType })) return { encoder: 'ffmpeg-wasm', reason: 'MP4·MOV가 아닌 원본은 예비 인코더로 처리합니다.' };
  return { encoder: 'webcodecs' };
}

/** 배속이 걸렸는지·음정 유지인지·모든 클립이 같은 배속인지 (인코더 선택에 쓴다) */
export function speedPlan(doc: EditorDoc): { changed: boolean; pitchPreserve: boolean; uniform: boolean } {
  const speeds = new Set(doc.clips.filter((c) => c.enabled).map((c) => c.speed));
  const changed = doc.view.globalSpeed !== 1 || [...speeds].some((v) => v !== 1);
  return { changed, pitchPreserve: doc.view.pitchPreserve, uniform: speeds.size <= 1 };
}

/** 예상 소요 시간. ffmpeg 경로가 10분을 넘으면 시작 전에 경고한다 (PROMPT 7-2) */
export function estimateExportMs(asset: MediaAsset, doc: EditorDoc, opts: ExportOptions): { encoder: UsedEncoder; ms: number } {
  const { job } = buildRenderJob(asset, doc, opts);
  const { encoder } = pickEncoder(opts.encoderPref, asset, job.output.format, speedPlan(doc));
  const outMs = outputDurationMs(doc.edl, clipSpeedRanges(doc.clips), doc.view.globalSpeed);
  if (encoder === 'ffmpeg-wasm') {
    const mt = typeof self !== 'undefined' && self.crossOriginIsolated === true;
    return { encoder, ms: estimateFfmpegMs(outMs, job.output.width, job.output.height, mt) };
  }
  return { encoder, ms: Math.round(outMs * (encoder === 'native' ? 0.05 : 0.4)) };
}

async function renderViaWebCodecs(req: ExportRequest, job: RenderJob, jobId: string): Promise<Blob> {
  const outPath = job.output.format === 'mp4' ? paths.export(req.project.id, jobId, 'mp4') : undefined;
  const res = await encodeWorker().call('render', { file: req.source, job, outPath }, { onProgress: req.onProgress, signal: req.signal });
  if (res.path) return readFile(res.path);
  return new Blob([res.buffer ?? new ArrayBuffer(0)], { type: res.mime });
}

async function renderViaFfmpeg(req: ExportRequest, job: RenderJob): Promise<Blob> {
  // 폴백 인코더(30MB+)는 실제로 필요할 때만 내려받는다
  const { renderWithFfmpeg } = await import('./ffmpeg');
  return renderWithFfmpeg(job, req.source, req.onProgress, req.signal);
}

export async function runExport(req: ExportRequest): Promise<ExportResult> {
  const started = Date.now();
  const { job, preset } = buildRenderJob(req.asset, req.doc, req);
  const jobId = `job-${nanoid(8)}`;
  const db = getDb();
  const record: ExportJob = {
    id: jobId, projectId: req.project.id, preset: preset.id, format: preset.format,
    width: job.output.width, height: job.output.height, fps: job.output.fps, bitrate: job.output.bitrate,
    burnSubtitles: !!job.subtitles, applyMosaic: !!job.mosaicTracks?.length,
    encoder: 'webcodecs', status: 'running', progress: 0, startedAt: started,
  };
  // 이전 내보내기 결과는 지운다 — 같은 영상의 결과물이 저장공간에 쌓이지 않게
  await deleteDir(`${paths.projectDir(req.project.id)}/exports`).catch(() => undefined);
  await db.exportJobs.put(record);

  try {
    let { encoder, reason } = pickEncoder(req.encoderPref, req.asset, job.output.format, speedPlan(req.doc));
    req.onEncoder?.(encoder, encoder === 'ffmpeg-wasm' ? reason : undefined);
    let blob: Blob;
    if (encoder === 'native') {
      blob = await exportWavRanges(req.source, keptRanges(req.doc.edl), req.onProgress, req.signal);
    } else if (encoder === 'webcodecs') {
      try {
        blob = await renderViaWebCodecs(req, job, jobId);
      } catch (e) {
        const err = toAppError(e, 'ENCODE_FAILED');
        if (req.encoderPref !== 'auto' || !['UNSUPPORTED_CODEC', 'UNSUPPORTED_FORMAT'].includes(err.code)) throw err;
        // 실패해도 결과는 나오게 (PRD 8장): 코덱 미지원이면 ffmpeg로 자동 전환
        encoder = 'ffmpeg-wasm';
        req.onEncoder?.(encoder, err.message);
        blob = await renderViaFfmpeg(req, job);
      }
    } else {
      blob = await renderViaFfmpeg(req, job);
    }
    await db.exportJobs.update(jobId, { status: 'done', progress: 100, finishedAt: Date.now(), encoder: encoder === 'native' ? 'webcodecs' : encoder });
    const ext = preset.format;
    return { blob, fileName: `${baseName(req.asset.fileName)}_편집ON.${ext}`, encoder, jobId, elapsedMs: Date.now() - started };
  } catch (e) {
    const err = toAppError(e, 'ENCODE_FAILED');
    await db.exportJobs.update(jobId, { status: err.code === 'ABORTED' ? 'aborted' : 'failed', errorCode: err.code, finishedAt: Date.now() }).catch(() => undefined);
    throw err;
  }
}
