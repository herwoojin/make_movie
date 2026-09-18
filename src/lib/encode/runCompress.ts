// 압축 실행. 기본은 빠른 인코더(WebCodecs), 실패하면 예비 인코더(ffmpeg)로 이어서 결과를 낸다.
import { AppError, toAppError } from '@/lib/errors';
import { sidecar } from '@/lib/sidecar/client';
import { isMp4Like, probeMedia } from '@/lib/media/probeClient';
import { checkEnv } from '@/lib/env/capabilities';
import { encodeWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';
import { buildCompressJob, planCompression, type CompressPlan } from './compress';

export interface CompressResult {
  blob: Blob;
  plan: CompressPlan;
  durationMs: number;
  encoder: 'sidecar-ffmpeg' | 'webcodecs' | 'ffmpeg-wasm';
}

/** 내 컴퓨터의 ffmpeg로 압축한다. 브라우저 인코더보다 몇 배 빠르다 */
async function compressViaSidecar(
  file: File, plan: CompressPlan, durationMs: number, onProgress: (p: Progress) => void, signal: AbortSignal,
): Promise<Blob> {
  const inPath = await sidecar.uploadTemp(file, file.name);
  const outPath = `${inPath.replace(/\.[^.]+$/, '')}-compressed.mp4`;
  const kbps = Math.round(plan.bitrate / 1000);
  await sidecar.runFfmpeg(
    {
      args: [
        '-y', '-i', inPath,
        '-vf', `scale=${plan.width}:${plan.height}`,
        '-r', String(plan.fps),
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`,
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
        outPath,
      ],
      outPath,
      durationMs,
    },
    (done, total) => onProgress({ phase: 'render', done, total: Math.max(1, total) }),
    signal,
  );
  return sidecar.readFile(outPath);
}

export async function compressFile(
  file: File,
  opts: { presetId: string; targetMB?: number },
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<CompressResult> {
  const probe = await probeMedia(file);
  if (probe.durationMs <= 0) throw new AppError('UNSUPPORTED_FORMAT', '영상 길이를 읽지 못했습니다.', '다른 파일로 시도해 주세요.');
  const asset = {
    width: probe.width, height: probe.height, fps: probe.fps, durationMs: probe.durationMs,
    audioCodec: probe.hasAudio ? (probe.audioCodec ?? 'unknown') : 'none',
  };
  const plan = planCompression(asset, opts.presetId, opts.targetMB);
  const job = buildCompressJob(asset, plan);

  // 우선순위: 내 컴퓨터 ffmpeg > 브라우저 빠른 인코더 > wasm 예비 인코더
  if (sidecar.isReady() && sidecar.features().ffmpeg) {
    try {
      const blob = await compressViaSidecar(file, plan, probe.durationMs, onProgress, signal);
      return { blob, plan, durationMs: probe.durationMs, encoder: 'sidecar-ffmpeg' };
    } catch (e) {
      if (toAppError(e).code === 'ABORTED') throw e;
      // 도우미가 중간에 꺼졌을 수 있다 — 아래 경로로 이어서 만든다
    }
  }

  const canWebCodecs = checkEnv().webCodecs && isMp4Like({ name: file.name, type: file.type });
  if (canWebCodecs) {
    try {
      const res = await encodeWorker().call('render', { file, job }, { onProgress, signal });
      return { blob: new Blob([res.buffer ?? new ArrayBuffer(0)], { type: res.mime }), plan, durationMs: probe.durationMs, encoder: 'webcodecs' };
    } catch (e) {
      const err = toAppError(e, 'ENCODE_FAILED');
      if (err.code === 'ABORTED') throw err;
      // 코덱을 못 다루는 경우에도 결과는 나오게 (PRD 8장)
    }
  }
  const { renderWithFfmpeg } = await import('./ffmpeg');
  const blob = await renderWithFfmpeg(job, file, onProgress, signal);
  return { blob, plan, durationMs: probe.durationMs, encoder: 'ffmpeg-wasm' };
}
