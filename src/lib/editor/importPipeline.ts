// 파일 임포트 (TRD 4.1): 검증 → 용량 확인 → 메타 추출 → OPFS 복사 → 레코드 생성.
// 파형·썸네일은 에디터가 열린 뒤 백그라운드로 만든다 — 타임라인을 먼저 띄워 기다리는 느낌을 줄이기 위해.
import { nanoid } from 'nanoid';
import type { MediaAsset, PipelineStage, Project, SourceTool } from '@/types/models';
import { DEFAULT_PROJECT_VIEW } from '@/types/editor';
import { decodeToMono16k } from '@/lib/audio/decode';
import { createInitialEdl } from '@/lib/core/edl';
import { AppError, throwIfAborted, toAppError } from '@/lib/errors';
import { probeMedia } from '@/lib/media/probeClient';
import { getDb, SCHEMA_VERSION } from '@/lib/storage/db';
import { paths, readFile, writeFile } from '@/lib/storage/opfs';
import { defaultStyle, saveWaveform } from '@/lib/storage/projectRepo';
import { ensureRoomFor, requestPersistence } from '@/lib/storage/quota';
import { audioWorker, storageWorker } from '@/lib/worker/instances';

export const ACCEPT_VIDEO = 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv';
export const MAX_FILE_BYTES = 4 * 1024 ** 3;
export const LONG_VIDEO_MS = 20 * 60 * 1000;

export function validateVideoFile(file: { name: string; type: string; size: number }): void {
  const okType = /^video\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name);
  if (!okType) throw new AppError('UNSUPPORTED_FORMAT', `"${file.name}"은(는) 영상 파일이 아닙니다.`, 'MP4, MOV, WebM 영상 파일을 올려 주세요.');
  if (file.size > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', '4GB가 넘는 파일은 브라우저에서 처리하기 어렵습니다.', '20분 이하로 나눠서 올려 주세요.');
  if (file.size === 0) throw new AppError('UNSUPPORTED_FORMAT', '빈 파일입니다.', '다른 파일을 선택해 주세요.');
}

export interface ImportProgress {
  stage: 'check' | 'probe' | 'copy' | 'save';
  ratio: number;
  label: string;
}

export interface CreateProjectOptions {
  /** 어느 화면에서 들어왔는지 (1단계 자동편집 / 2단계 직접 열기 등) */
  sourceTool?: SourceTool;
  pipelineStage?: PipelineStage;
}

export async function createProjectFromFile(
  file: File, onProgress: (p: ImportProgress) => void, signal?: AbortSignal, opts: CreateProjectOptions = {},
): Promise<{ projectId: string; warnings: string[] }> {
  validateVideoFile(file);
  onProgress({ stage: 'check', ratio: 0.02, label: '저장공간 확인 중' });
  await ensureRoomFor(file.size);
  void requestPersistence();

  onProgress({ stage: 'probe', ratio: 0.05, label: '영상 정보 읽는 중' });
  const probe = await probeMedia(file);
  throwIfAborted(signal);
  const warnings: string[] = [];
  if (probe.durationMs > LONG_VIDEO_MS) warnings.push('20분이 넘는 영상은 느리거나 브라우저가 멈출 수 있습니다. 가능하면 구간을 나눠 처리해 주세요.');
  if (probe.container === 'other') warnings.push('MP4가 아닌 영상은 내보내기가 느린 예비 인코더로 처리됩니다.');

  const projectId = nanoid(10);
  const assetId = nanoid(10);
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? 'mp4').toLowerCase();
  const opfsPath = paths.source(projectId, assetId, ext);

  // 원본은 읽기 전용 사본으로 OPFS에 둔다: 브라우저를 닫았다 켜도 이어서 편집할 수 있게
  onProgress({ stage: 'copy', ratio: 0.1, label: '브라우저 저장소에 복사 중' });
  const onCopy = (done: number, total: number) => onProgress({ stage: 'copy', ratio: 0.1 + 0.85 * (total > 0 ? done / total : 0), label: '브라우저 저장소에 복사 중' });
  try {
    await storageWorker().call('write', { path: opfsPath, file }, { signal, onProgress: (p) => onCopy(p.done, p.total) });
  } catch (e) {
    const err = toAppError(e, 'STORAGE_FAILED');
    if (err.code === 'QUOTA_EXCEEDED' || err.code === 'ABORTED') throw err;
    await writeFile(opfsPath, file, (done, total) => onCopy(done, total ?? file.size), signal);
  }

  onProgress({ stage: 'save', ratio: 0.97, label: '프로젝트 만드는 중' });
  const now = Date.now();
  const project: Project = {
    id: projectId, name: file.name.replace(/\.[^.]+$/, ''), durationMs: probe.durationMs, sourceDurationMs: probe.durationMs,
    width: probe.width, height: probe.height, fps: probe.fps, status: 'draft', createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION,
    ...DEFAULT_PROJECT_VIEW, pipelineStage: opts.pipelineStage ?? 1, sourceTool: opts.sourceTool ?? 'import',
  };
  const asset: MediaAsset = {
    id: assetId, projectId, kind: 'video', fileName: file.name, fileSize: file.size, mimeType: file.type || `video/${ext}`,
    opfsPath, durationMs: probe.durationMs, width: probe.width, height: probe.height, fps: probe.fps,
    videoCodec: probe.videoCodec, audioCodec: probe.hasAudio ? (probe.audioCodec ?? 'unknown') : 'none',
    sampleRate: probe.sampleRate, channels: probe.channels, createdAt: now,
  };
  const db = getDb();
  await db.transaction('rw', [db.projects, db.mediaAssets, db.edlSegments, db.subtitleStyles], async () => {
    await db.projects.add(project);
    await db.mediaAssets.add(asset);
    await db.edlSegments.bulkAdd(createInitialEdl(projectId, assetId, probe.durationMs, now));
    await db.subtitleStyles.add(defaultStyle(projectId));
  });
  onProgress({ stage: 'save', ratio: 1, label: '완료' });
  return { projectId, warnings };
}

/** 파형 피크 + PCM 캐시. 소리가 없으면 null (편집은 계속 가능) */
export async function analyzeAudio(
  projectId: string, asset: MediaAsset, source: Blob, onProgress: (ratio: number, label: string) => void, signal?: AbortSignal,
): Promise<Int8Array | null> {
  if (asset.audioCodec === 'none') return null;
  onProgress(0.05, '소리를 풀어내는 중');
  let decoded;
  try {
    decoded = await decodeToMono16k(source, signal);
  } catch (e) {
    const err = toAppError(e);
    if (err.code === 'NO_AUDIO_TRACK') return null;
    throw err;
  }
  onProgress(0.7, '파형 계산 중');
  const pcm = decoded.pcm.slice();
  const res = await audioWorker().call('analyze', {
    key: asset.id, pcm: pcm.buffer, sampleRate: decoded.sampleRate, pcmPath: paths.pcm(projectId, asset.id),
  }, { transfer: [pcm.buffer], signal });
  const peaks = new Int8Array(res.peaks);
  await saveWaveform(asset.id, peaks, res.pointsPerSecond);
  onProgress(1, '완료');
  return peaks;
}

export interface ThumbnailFrame { timeMs: number; bitmap: ImageBitmap }

const THUMB_WIDTH = 160;

/** 썸네일 스트립: 최대 120장, 1초 이상 간격. 이미 만들어 둔 것이 있으면 OPFS에서 읽기만 한다 */
export async function loadOrCreateThumbnails(
  projectId: string, asset: MediaAsset, source: Blob, onThumb: (t: ThumbnailFrame) => void, signal: AbortSignal,
): Promise<void> {
  const db = getDb();
  const existing = await db.thumbnails.where('[assetId+timeMs]').between([asset.id, -Infinity], [asset.id, Infinity]).toArray();
  if (existing.length > 0) {
    for (const t of existing) {
      if (signal.aborted) return;
      try {
        onThumb({ timeMs: t.timeMs, bitmap: await createImageBitmap(await readFile(t.opfsPath)) });
      } catch {
        // 일부 썸네일이 지워졌어도 타임라인은 동작한다
      }
    }
    return;
  }
  if (!asset.width || !asset.height || asset.durationMs <= 0) return;

  const interval = Math.max(1000, Math.ceil(asset.durationMs / 120 / 1000) * 1000);
  const height = Math.max(2, Math.round((THUMB_WIDTH * asset.height) / asset.width));
  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  const canvas = new OffscreenCanvas(THUMB_WIDTH, height);
  const ctx = canvas.getContext('2d');
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new AppError('DECODE_FAILED'));
    });
    if (!ctx) return;
    for (let timeMs = 0; timeMs < asset.durationMs; timeMs += interval) {
      if (signal.aborted) return;
      video.currentTime = Math.min(asset.durationMs - 50, timeMs + 100) / 1000;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
      ctx.drawImage(video, 0, 0, THUMB_WIDTH, height);
      const bitmap = await createImageBitmap(canvas);
      onThumb({ timeMs, bitmap });
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 });
      const path = paths.thumb(projectId, timeMs);
      await writeFile(path, blob);
      await db.thumbnails.put({ id: `${asset.id}-t${timeMs}`, assetId: asset.id, timeMs, opfsPath: path });
    }
  } catch {
    // 썸네일은 부가 기능 — 실패해도 편집을 막지 않는다
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}
