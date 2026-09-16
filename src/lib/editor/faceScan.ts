// 얼굴 스캔 오케스트레이션: MP4는 워커에서 직접 디코드, 그 외 형식은 메인에서 프레임을 떠 워커로 보낸다.
import { nanoid } from 'nanoid';
import type { MediaAsset, MosaicKeyframe } from '@/types/models';
import type { MosaicTrackDoc } from '@/types/editor';
import { throwIfAborted, toAppError } from '@/lib/errors';
import { isMp4Like } from '@/lib/media/probeClient';
import { OnlineTracker, trackSpan, type TrackResult } from '@/lib/vision/tracker';
import { visionWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';

export const SAMPLE_EVERY_FRAMES = 5;

export interface FaceScanResult {
  tracks: MosaicTrackDoc[];
  holdMs: number;
}

export function toTrackDocs(projectId: string, results: TrackResult[], thumbnails: Record<string, string>, startIndex = 0): MosaicTrackDoc[] {
  return results.map((r, i) => {
    const id = `trk-${nanoid(8)}`;
    const span = trackSpan(r.keyframes);
    const keyframes: MosaicKeyframe[] = r.keyframes.map((k, j) => ({
      id: `${id}-k${j}`, trackId: id, timeMs: k.timeMs, x: k.x, y: k.y, w: k.w, h: k.h, score: k.score, interpolated: k.interpolated,
    }));
    return {
      id, projectId, personLabel: `인물 ${startIndex + i + 1}`, enabled: true, mode: 'pixelate', intensity: 28, scale: 1.3,
      shape: 'ellipse', emoji: '😊', createdBy: 'auto', startMs: span.startMs, endMs: span.endMs, thumbnail: thumbnails[r.id], keyframes,
    };
  });
}

async function scanWithElement(source: Blob, asset: MediaAsset, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<{ results: TrackResult[]; thumbnails: Record<string, string>; intervalMs: number }> {
  const fps = asset.fps && asset.fps > 0 ? asset.fps : 30;
  const intervalMs = Math.round((SAMPLE_EVERY_FRAMES * 1000) / fps);
  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true;
  video.src = url;
  const tracker = new OnlineTracker();
  const firstSeen = new Map<string, number>();
  try {
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('decode')); });
    const width = Math.min(640, video.videoWidth || 640);
    const height = Math.round((width * (video.videoHeight || 360)) / (video.videoWidth || 640));
    const BATCH = 12;
    for (let t = 0; t < asset.durationMs; ) {
      const frames: ImageBitmap[] = [];
      const times: number[] = [];
      for (let i = 0; i < BATCH && t < asset.durationMs; i++, t += intervalMs) {
        throwIfAborted(signal);
        video.currentTime = t / 1000;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
        frames.push(await createImageBitmap(video, { resizeWidth: width, resizeHeight: height }));
        times.push(t);
      }
      const { detections } = await visionWorker().call('detectBatch', { frames, timesMs: times, mode: 'VIDEO' }, { transfer: frames, signal });
      detections.forEach((d, i) => {
        tracker.push({ timeMs: times[i], detections: d }).forEach((id) => { if (!firstSeen.has(id)) firstSeen.set(id, times[i]); });
      });
      onProgress({ phase: 'detect', done: Math.min(t, asset.durationMs), total: asset.durationMs });
    }
    const results = tracker.finish().filter((r) => r.keyframes.length >= 2);
    const thumbnails: Record<string, string> = {};
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    for (const r of results) {
      const best = r.keyframes.reduce((a, b) => (b.score > a.score ? b : a), r.keyframes[0]);
      video.currentTime = best.timeMs / 1000;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
      const W = video.videoWidth;
      const H = video.videoHeight;
      const size = Math.max(best.w * W, best.h * H) * 1.3;
      ctx?.drawImage(video, (best.x + best.w / 2) * W - size / 2, (best.y + best.h / 2) * H - size / 2, size, size, 0, 0, 96, 96);
      thumbnails[r.id] = canvas.toDataURL('image/jpeg', 0.8);
    }
    return { results, thumbnails, intervalMs };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

export async function scanFaces(
  projectId: string, asset: MediaAsset, source: File, existingCount: number, onProgress: (p: Progress) => void, signal: AbortSignal,
): Promise<FaceScanResult> {
  if (isMp4Like(source)) {
    try {
      const res = await visionWorker().call('scan', { file: source, sampleEvery: SAMPLE_EVERY_FRAMES }, { onProgress, signal });
      return { tracks: toTrackDocs(projectId, res.tracks, res.thumbnails, existingCount), holdMs: res.sampleIntervalMs };
    } catch (e) {
      const err = toAppError(e);
      if (!['UNSUPPORTED_CODEC', 'UNSUPPORTED_FORMAT'].includes(err.code)) throw err;
    }
  }
  const res = await scanWithElement(source, asset, onProgress, signal);
  return { tracks: toTrackDocs(projectId, res.results, res.thumbnails, existingCount), holdMs: res.intervalMs };
}

export function holdMsFor(asset: Pick<MediaAsset, 'fps'>): number {
  const fps = asset.fps && asset.fps > 0 ? asset.fps : 30;
  return Math.round((SAMPLE_EVERY_FRAMES * 1000) / fps);
}
