// 얼굴 검출·추적 워커 (TRD 4.5). MP4는 워커 안에서 직접 디코드하고 N프레임마다 검출한다.
// 다른 형식은 메인 스레드가 프레임을 떠서 detectBatch로 보낸다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { Mp4Demuxer, sampleDurationUs, sampleTimeUs } from '@/lib/encode/webcodecs/demux';
import { createFaceDetector, type FaceDetectorHandle } from '@/lib/vision/faceDetect';
import { OnlineTracker, type Detection, type TrackResult } from '@/lib/vision/tracker';
import { serve } from '@/lib/worker/serve';

export interface ScanResult {
  tracks: TrackResult[];
  sampleIntervalMs: number;
  thumbnails: Record<string, string>;
  framesScanned: number;
}

export type VisionWorkerApi = {
  scan: { payload: { file: Blob; sampleEvery: number }; result: ScanResult };
  detectBatch: { payload: { frames: ImageBitmap[]; timesMs: number[]; mode: 'VIDEO' | 'IMAGE' }; result: { detections: Detection[][] } };
};

let videoDetector: Promise<FaceDetectorHandle> | null = null;
let imageDetector: Promise<FaceDetectorHandle> | null = null;

function detector(mode: 'VIDEO' | 'IMAGE'): Promise<FaceDetectorHandle> {
  if (mode === 'VIDEO') {
    videoDetector ??= createFaceDetector('VIDEO').catch((e) => { videoDetector = null; throw e; });
    return videoDetector;
  }
  imageDetector ??= createFaceDetector('IMAGE').catch((e) => { imageDetector = null; throw e; });
  return imageDetector;
}

const THUMB = 96;

async function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve<VisionWorkerApi>({
  async scan({ file, sampleEvery }, { signal, progress }) {
    const faces = await detector('VIDEO');
    const demux = await Mp4Demuxer.open(file, signal);
    const v = demux.info.video;
    if (!v) throw new AppError('UNSUPPORTED_FORMAT', '영상 트랙이 없습니다.', '영상 파일에서만 얼굴을 찾을 수 있습니다.');
    if (!(await VideoDecoder.isConfigSupported(v.config).catch(() => null))?.supported) {
      throw new AppError('UNSUPPORTED_CODEC', '이 브라우저가 영상을 워커에서 풀지 못합니다.', '느린 방식으로 다시 시도합니다.');
    }

    const every = Math.max(1, Math.round(sampleEvery));
    const tracker = new OnlineTracker();
    // 인물별로 가장 또렷한(점수 높은) 얼굴을 대표 썸네일로 남긴다
    const best = new Map<string, { score: number; canvas: OffscreenCanvas }>();
    let frameNo = 0;
    let scanned = 0;
    let lastTsMs = -1;
    let failure: unknown = null;

    const decoder = new VideoDecoder({
      output: (frame) => {
        try {
          if (failure || frameNo++ % every !== 0) return;
          const timeMs = Math.max(lastTsMs + 1, Math.round(frame.timestamp / 1000));
          lastTsMs = timeMs;
          const W = frame.displayWidth;
          const H = frame.displayHeight;
          const detections = faces.detectVideo(frame, timeMs, W, H);
          const ids = tracker.push({ timeMs, detections });
          scanned++;
          detections.forEach((d, i) => {
            const id = ids[i];
            const prev = best.get(id);
            if (prev && d.score <= prev.score + 0.05) return;
            const canvas = prev?.canvas ?? new OffscreenCanvas(THUMB, THUMB);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const size = Math.max(d.w * W, d.h * H) * 1.3;
            const cx = (d.x + d.w / 2) * W;
            const cy = (d.y + d.h / 2) * H;
            ctx.drawImage(frame, cx - size / 2, cy - size / 2, size, size, 0, 0, THUMB, THUMB);
            best.set(id, { score: d.score, canvas });
          });
          progress({ phase: 'detect', done: Math.round(frame.timestamp / 1000), total: Math.max(1, v.durationMs) });
        } catch (e) {
          failure = e;
        } finally {
          frame.close();
        }
      },
      error: (e) => { failure = e; },
    });
    decoder.configure(v.config);

    try {
      await demux.readSamples([v.id], async (_id, samples) => {
        for (const s of samples) {
          if (failure) throw failure;
          throwIfAborted(signal);
          if (!s.data) continue;
          decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: sampleTimeUs(s, v.timing), duration: sampleDurationUs(s, v.timing), data: s.data }));
          while (decoder.decodeQueueSize > 8 && !failure) {
            throwIfAborted(signal);
            await sleep(1);
          }
        }
      }, signal);
      await decoder.flush();
      if (failure) throw failure;
    } finally {
      if (decoder.state !== 'closed') decoder.close();
    }

    const tracks = tracker.finish().filter((t) => t.keyframes.length >= 2);
    const thumbnails: Record<string, string> = {};
    for (const t of tracks) {
      const b = best.get(t.id);
      if (b) thumbnails[t.id] = await canvasToDataUrl(b.canvas);
    }
    return { result: { tracks, sampleIntervalMs: Math.round((every * 1000) / (v.fps || 30)), thumbnails, framesScanned: scanned } };
  },

  async detectBatch({ frames, timesMs, mode }) {
    const faces = await detector(mode);
    const detections = frames.map((bitmap, i) => {
      try {
        return mode === 'VIDEO'
          ? faces.detectVideo(bitmap, timesMs[i] ?? i, bitmap.width, bitmap.height)
          : faces.detectImage(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    });
    return { result: { detections } };
  },
});
