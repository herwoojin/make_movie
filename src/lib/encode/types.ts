// 인코더 어댑터 (TRD 4.6). WebCodecs(1순위)와 ffmpeg.wasm(폴백)을 같은 모양으로 감싼다.
import type { EdlSegment, EncoderId, ExportFormat, StyleValues, SubtitleCue } from '@/types/models';
import type { MosaicTrackDoc } from '@/types/editor';
import type { SpeedRange } from '@/lib/core/edl';
import type { FrameView } from '@/lib/render/frame';
import type { Progress } from '@/lib/worker/protocol';

export interface RenderOutput {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /** constant = 목표 용량을 맞춰야 할 때 (용량 줄이기). 기본은 화질 우선 */
  bitrateMode?: 'variable' | 'constant';
  format: Extract<ExportFormat, 'mp4' | 'gif' | 'mp3' | 'wav'>;
  fit: 'contain' | 'cover';
}

export interface RenderJob {
  edl: EdlSegment[];
  /** 배속 구간 (원본 기준). 적용 순서는 원본 → EDL → 배속 */
  speeds?: SpeedRange[];
  globalSpeed?: number;
  /** 배속을 걸어도 목소리 톤을 유지할지 */
  pitchPreserve?: boolean;
  /** 화면 비율·채움 방식 (미리보기와 같은 변환을 쓴다) */
  view?: Pick<FrameView, 'aspectMode' | 'fillMode' | 'reframe'>;
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
