// 도구함용 프레임 추출: <video>를 구간·fps에 맞춰 이동시키며 ImageBitmap을 떠서 GIF 워커로 보낸다.
// 도구함은 MP4 외에 WebM(화면 녹화)도 다뤄야 해서 WebCodecs 디먹서 대신 브라우저 재생기를 쓴다.
import { nanoid } from 'nanoid';
import { AppError, throwIfAborted } from '@/lib/errors';
import { gifWorker } from '@/lib/worker/instances';

export interface GifOptions {
  width: number;
  fps: number;
  startMs: number;
  maxDurationMs: number;
  /** 0이면 제한 없음. 넘으면 가로 크기를 줄여 다시 만든다 */
  maxBytes: number;
}

export async function openVideo(file: Blob): Promise<{ video: HTMLVideoElement; durationMs: number; close: () => void }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new AppError('UNSUPPORTED_FORMAT', '이 브라우저에서 열 수 없는 영상입니다.', 'MP4 또는 WebM 파일을 선택해 주세요.'));
  });
  if (!Number.isFinite(video.duration)) {
    // 화면 녹화 WebM은 길이 정보가 없다 — 끝으로 보내면 실제 길이가 채워진다
    await new Promise<void>((resolve) => { video.ontimeupdate = () => { video.ontimeupdate = null; resolve(); }; video.currentTime = 1e9; });
  }
  return {
    video,
    durationMs: Math.round(video.duration * 1000),
    close: () => { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); },
  };
}

export function seekVideo(video: HTMLVideoElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => { video.onseeked = null; resolve(); };
    video.currentTime = Math.max(0, ms) / 1000;
  });
}

async function encodeOnce(video: HTMLVideoElement, durationMs: number, o: GifOptions, onProgress: (r: number) => void, signal?: AbortSignal): Promise<Blob> {
  const width = Math.max(2, Math.round(o.width / 2) * 2);
  const height = Math.max(2, Math.round((width * video.videoHeight) / video.videoWidth / 2) * 2);
  const end = Math.min(durationMs, o.startMs + o.maxDurationMs);
  const step = 1000 / o.fps;
  const total = Math.max(1, Math.floor((end - o.startMs) / step));
  const session = nanoid(8);
  const BATCH = 8;
  let started = false;
  for (let i = 0; i < total; i += BATCH) {
    const frames: ImageBitmap[] = [];
    for (let j = i; j < Math.min(total, i + BATCH); j++) {
      throwIfAborted(signal);
      await seekVideo(video, o.startMs + j * step);
      frames.push(await createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }));
    }
    if (!started) {
      await gifWorker().call('start', { session, width, height, delayMs: step, frames }, { transfer: frames, signal });
      started = true;
    } else {
      await gifWorker().call('add', { session, frames }, { transfer: frames, signal });
    }
    onProgress(Math.min(1, (i + BATCH) / total));
  }
  const { buffer } = await gifWorker().call('finish', { session }, { signal });
  return new Blob([buffer], { type: 'image/gif' });
}

export async function videoToGif(file: Blob, o: GifOptions, onProgress: (ratio: number) => void, signal?: AbortSignal): Promise<Blob> {
  const { video, durationMs, close } = await openVideo(file);
  try {
    let width = o.width;
    for (let attempt = 0; attempt < 4; attempt++) {
      const blob = await encodeOnce(video, durationMs, { ...o, width }, (r) => onProgress((attempt + r) / (attempt + 1)), signal);
      if (!o.maxBytes || blob.size <= o.maxBytes || width <= 160) return blob;
      width = Math.round(width * 0.75);
    }
    throw new AppError('ENCODE_FAILED', '용량 상한 안으로 줄이지 못했습니다.', '길이를 줄이거나 초당 장수를 낮춰 보세요.');
  } finally {
    close();
  }
}
