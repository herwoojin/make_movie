// MediaPipe FaceDetector 래퍼 (살핌ON 패턴 재사용). wasm·모델은 /public/mediapipe/ 에 self-host.
// 워커와 메인 스레드 양쪽에서 쓸 수 있게 로더 방식을 실행 환경에 맞춰 고른다.
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { AppError } from '@/lib/errors';
import type { Detection } from './tracker';

export const MEDIAPIPE_BASE = '/mediapipe';
export const FACE_MODEL = `${MEDIAPIPE_BASE}/blaze_face_short_range.tflite`;

type Source = ImageBitmap | VideoFrame | HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;

export interface FaceDetectorHandle {
  detectVideo(source: Source, timestampMs: number, width: number, height: number): Detection[];
  detectImage(source: Source, width: number, height: number): Detection[];
  close(): void;
}

function origin(): string {
  return typeof location !== 'undefined' ? location.origin : '';
}

/** 모듈 워커에서는 importScripts가 TypeError를 던진다 — 그 경우 ES 모듈 로더를 써야 한다 */
function isModuleWorker(): boolean {
  const g = globalThis as unknown as { importScripts?: (...urls: string[]) => void; document?: unknown };
  if (g.document || typeof g.importScripts !== 'function') return false;
  try {
    g.importScripts();
    return false;
  } catch {
    return true;
  }
}

function toDetections(result: { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] }, width: number, height: number): Detection[] {
  return result.detections
    .filter((d) => d.boundingBox)
    .map((d) => {
      const b = d.boundingBox!;
      return {
        x: Math.max(0, b.originX / width),
        y: Math.max(0, b.originY / height),
        w: Math.min(1, b.width / width),
        h: Math.min(1, b.height / height),
        score: d.categories[0]?.score ?? 0,
      };
    });
}

export async function createFaceDetector(mode: 'VIDEO' | 'IMAGE', minConfidence = 0.5): Promise<FaceDetectorHandle> {
  const useModule = isModuleWorker();
  if (useModule) {
    // MediaPipe 로더는 self.import가 있으면 그것으로 wasm 로더를 불러온다.
    // 번들러가 동적 import를 가로채지 않도록 여기서 번들 밖 import를 제공한다.
    const g = globalThis as unknown as { import?: (url: string) => Promise<unknown> };
    g.import = (url: string) => import(/* webpackIgnore: true */ url);
  }
  let detector: FaceDetector;
  try {
    const fileset = await FilesetResolver.forVisionTasks(`${origin()}${MEDIAPIPE_BASE}`, useModule);
    const create = (delegate: 'GPU' | 'CPU') => FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${origin()}${FACE_MODEL}`, delegate },
      runningMode: mode,
      minDetectionConfidence: minConfidence,
    });
    try {
      detector = await create('GPU');
    } catch {
      detector = await create('CPU');
    }
  } catch (e) {
    throw new AppError('VISION_LOAD_FAILED', `얼굴 검출 엔진을 불러오지 못했습니다. (${e instanceof Error ? e.message : String(e)})`);
  }

  return {
    detectVideo(source, timestampMs, width, height) {
      return toDetections(detector.detectForVideo(source as never, timestampMs), width, height);
    },
    detectImage(source, width, height) {
      return toDetections(detector.detect(source as never), width, height);
    },
    close() {
      detector.close();
    },
  };
}
