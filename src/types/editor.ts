import type { MosaicTrackDoc } from '@/lib/vision/mosaicRender';
import type { EdlSegment, SubtitleCue, SubtitleStyle } from './models';

export type { MosaicTrackDoc };

/** 되돌리기 대상이 되는 편집 문서. 원본 미디어는 여기 없다 — 편집 결정만 담는다. */
export interface EditorDoc {
  edl: EdlSegment[];
  cues: SubtitleCue[];
  style: SubtitleStyle;
  tracks: MosaicTrackDoc[];
}
