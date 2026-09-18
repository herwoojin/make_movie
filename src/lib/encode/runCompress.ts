// 압축 실행. 기본은 빠른 인코더(WebCodecs), 실패하면 예비 인코더(ffmpeg)로 이어서 결과를 낸다.
import { AppError, toAppError } from '@/lib/errors';
import { isMp4Like, probeMedia } from '@/lib/media/probeClient';
import { checkEnv } from '@/lib/env/capabilities';
import { encodeWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';
import { buildCompressJob, planCompression, type CompressPlan } from './compress';

export interface CompressResult {
  blob: Blob;
  plan: CompressPlan;
  durationMs: number;
  encoder: 'webcodecs' | 'ffmpeg-wasm';
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
