// 내보내기 프리셋. 원본보다 크게 키우지 않는다(용량만 늘고 화질은 그대로).
import type { ExportFormat, ExportPreset } from '@/types/models';

export interface ExportPresetDef {
  id: ExportPreset;
  label: string;
  description: string;
  format: ExportFormat;
  /** 긴 변 기준 크기 (가로 영상이면 가로) */
  longSide?: number;
  /** 고정 크기 (쇼츠) */
  fixed?: { width: number; height: number };
  fit: 'contain' | 'cover';
  fps: number | 'source';
  bitrate: number;
}

export const EXPORT_PRESETS: ExportPresetDef[] = [
  { id: 'youtube-1080p', label: '유튜브 1080p', description: '가장 무난한 고화질 (MP4)', format: 'mp4', longSide: 1920, fit: 'contain', fps: 'source', bitrate: 8_000_000 },
  { id: 'youtube-720p', label: '유튜브 720p', description: '빠르고 용량이 작음 (MP4)', format: 'mp4', longSide: 1280, fit: 'contain', fps: 'source', bitrate: 5_000_000 },
  { id: 'shorts-1080x1920', label: '쇼츠·릴스 세로', description: '1080×1920, 가운데를 잘라 세로로 (MP4)', format: 'mp4', fixed: { width: 1080, height: 1920 }, fit: 'cover', fps: 'source', bitrate: 8_000_000 },
  { id: 'gif', label: 'GIF 움짤', description: '가로 480px, 초당 10장. 짧은 구간에 적합', format: 'gif', longSide: 480, fit: 'contain', fps: 10, bitrate: 0 },
  { id: 'audio-only', label: '오디오만', description: '잘라낸 결과의 소리만 WAV로', format: 'wav', fit: 'contain', fps: 'source', bitrate: 0 },
];

export function getPreset(id: string): ExportPresetDef {
  return EXPORT_PRESETS.find((p) => p.id === id) ?? EXPORT_PRESETS[0];
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function resolveOutputSize(preset: ExportPresetDef, srcWidth: number, srcHeight: number): { width: number; height: number } {
  if (preset.fixed) return preset.fixed;
  const w = srcWidth > 0 ? srcWidth : 1920;
  const h = srcHeight > 0 ? srcHeight : 1080;
  const long = Math.max(w, h);
  const scale = Math.min(1, (preset.longSide ?? long) / long);
  return { width: even(w * scale), height: even(h * scale) };
}

export function resolveFps(preset: ExportPresetDef, sourceFps: number): number {
  const src = sourceFps > 0 ? sourceFps : 30;
  if (preset.fps === 'source') return Math.min(60, Math.round(src * 100) / 100);
  return Math.min(preset.fps, src);
}

export function mimeFor(format: ExportFormat): string {
  switch (format) {
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'gif': return 'image/gif';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
  }
}
