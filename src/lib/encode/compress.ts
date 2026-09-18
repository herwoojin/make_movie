// 영상 용량 줄이기 (F-10). 이미 있는 인코더를 그대로 쓰고, 여기서는 "얼마나 줄일지"만 계산한다.
import type { MediaAsset } from '@/types/models';
import { createInitialEdl } from '@/lib/core/edl';
import type { RenderJob } from './types';

export interface CompressPreset {
  id: string;
  label: string;
  description: string;
  /** 세로 해상도 상한 (없으면 원본 유지) */
  maxHeight?: number;
  /** ffmpeg CRF 값 — 화질 기준. WebCodecs 경로에서는 비트레이트로 환산한다 */
  crf: number;
}

export const COMPRESS_PRESETS: CompressPreset[] = [
  { id: 'high', label: '고품질', description: '원본 크기 유지 · 보관용', crf: 20 },
  { id: 'standard', label: '표준', description: '1080p · 유튜브 업로드', maxHeight: 1080, crf: 24 },
  { id: 'light', label: '가볍게', description: '720p · 메신저 공유', maxHeight: 720, crf: 28 },
  { id: 'min', label: '최대 압축', description: '480p · 이메일 첨부', maxHeight: 480, crf: 32 },
  { id: 'target', label: '목표 용량 지정', description: '원하는 MB에 맞춰 자동 계산', crf: 26 },
];

export const AUDIO_KBPS = 128;

export function getCompressPreset(id: string): CompressPreset {
  return COMPRESS_PRESETS.find((p) => p.id === id) ?? COMPRESS_PRESETS[1];
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** CRF 화질을 픽셀당 비트로 환산 — 같은 CRF라도 화면이 크면 비트레이트가 커진다 */
const BITS_PER_PIXEL: Record<number, number> = { 20: 0.12, 24: 0.07, 26: 0.05, 28: 0.04, 32: 0.025 };

function bitsPerPixel(crf: number): number {
  const known = Object.keys(BITS_PER_PIXEL).map(Number).sort((a, b) => a - b);
  if (BITS_PER_PIXEL[crf]) return BITS_PER_PIXEL[crf];
  const lower = known.filter((k) => k <= crf).pop() ?? known[0];
  const upper = known.find((k) => k >= crf) ?? known[known.length - 1];
  if (lower === upper) return BITS_PER_PIXEL[lower];
  const t = (crf - lower) / (upper - lower);
  return BITS_PER_PIXEL[lower] + (BITS_PER_PIXEL[upper] - BITS_PER_PIXEL[lower]) * t;
}

export function compressedSize(srcWidth: number, srcHeight: number, maxHeight?: number): { width: number; height: number } {
  const w = srcWidth > 0 ? srcWidth : 1920;
  const h = srcHeight > 0 ? srcHeight : 1080;
  if (!maxHeight || h <= maxHeight) return { width: even(w), height: even(h) };
  const scale = maxHeight / h;
  return { width: even(w * scale), height: even(h * scale) };
}

export function presetBitrate(width: number, height: number, fps: number, crf: number): number {
  return Math.round(width * height * Math.max(1, fps) * bitsPerPixel(crf));
}

/** 목표 용량 역산: 비트레이트(bps) = (목표MB × 8 × 1024 × 1024) / 길이(초) - 오디오 */
export function targetBitrate(targetMB: number, durationMs: number, audioKbps = AUDIO_KBPS): number {
  const seconds = Math.max(0.1, durationMs / 1000);
  const total = (targetMB * 8 * 1024 * 1024) / seconds;
  return Math.max(120_000, Math.round(total - audioKbps * 1000));
}

export function estimateBytes(videoBitrate: number, durationMs: number, hasAudio: boolean, audioKbps = AUDIO_KBPS): number {
  const seconds = Math.max(0, durationMs / 1000);
  return Math.round(((videoBitrate + (hasAudio ? audioKbps * 1000 : 0)) * seconds) / 8);
}

export interface CompressPlan {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  estimatedBytes: number;
}

export function planCompression(
  asset: Pick<MediaAsset, 'width' | 'height' | 'fps' | 'durationMs' | 'audioCodec'>,
  presetId: string,
  targetMB?: number,
): CompressPlan {
  const preset = getCompressPreset(presetId);
  const { width, height } = compressedSize(asset.width ?? 0, asset.height ?? 0, preset.maxHeight);
  const fps = Math.min(60, Math.max(1, Math.round(asset.fps ?? 30)));
  const hasAudio = (asset.audioCodec ?? 'unknown') !== 'none';
  const bitrate = presetId === 'target' && targetMB
    ? targetBitrate(targetMB, asset.durationMs, hasAudio ? AUDIO_KBPS : 0)
    : presetBitrate(width, height, fps, preset.crf);
  return { width, height, fps, bitrate, estimatedBytes: estimateBytes(bitrate, asset.durationMs, hasAudio) };
}

/** 압축용 렌더 작업 — 컷·자막·모자이크 없이 통째로 다시 압축한다 */
export function buildCompressJob(
  asset: Pick<MediaAsset, 'width' | 'height' | 'fps' | 'durationMs' | 'audioCodec'>, plan: CompressPlan,
): RenderJob {
  return {
    edl: createInitialEdl('compress', 'asset', asset.durationMs, 0, () => 'seg-0'),
    mosaicHoldMs: 0,
    sourceWidth: asset.width ?? 0,
    sourceHeight: asset.height ?? 0,
    sourceFps: asset.fps ?? 30,
    hasAudio: (asset.audioCodec ?? 'unknown') !== 'none',
    // 목표 용량을 맞추려면 비트레이트를 고정해야 한다 (화질 우선 모드는 한참 밑돈다)
    output: { width: plan.width, height: plan.height, fps: plan.fps, bitrate: plan.bitrate, bitrateMode: 'constant', format: 'mp4', fit: 'contain' },
  };
}
