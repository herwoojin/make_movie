// 인코더 어댑터 (TRD 4.6). WebCodecs(1순위)와 ffmpeg.wasm(폴백)을 같은 모양으로 감싼다.
import type { EdlSegment, EncoderId, ExportFormat, StyleValues, SubtitleCue } from '@/types/models';
import type { MosaicTrackDoc } from '@/types/editor';
import type { Progress } from '@/lib/worker/protocol';

export interface RenderOutput {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  format: Extract<ExportFormat, 'mp4' | 'gif' | 'mp3' | 'wav'>;
  fit: 'contain' | 'cover';
}

export interface RenderJob {
  edl: EdlSegment[];
  subtitles?: SubtitleCue[];
  style?: StyleValues;
  mosaicTracks?: MosaicTrackDoc[];
  /** 검출 샘플 간격 — 첫/마지막 검출 앞뒤 프레임도 가리기 위해 */
  mosaicHoldMs: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFps: number;
  hasAudio: boolean;
  output: RenderOutput;
}

export interface EncoderAdapter {
  id: EncoderId;
  isAvailable(): Promise<boolean>;
  render(job: RenderJob, source: File, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Blob>;
}
