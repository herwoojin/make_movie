import type { MosaicTrackDoc } from '@/lib/vision/mosaicRender';
import type { AspectMode, EdlSegment, EditClip, FillMode, ReframeBox, SubtitleCue, SubtitleStyle, TranscriptWord } from './models';

export type { MosaicTrackDoc };

/** 프로젝트 레벨 보기 설정 (v2 F-04·F-05). 되돌리기 대상이라 문서 안에 둔다 */
export interface ProjectView {
  aspectMode: AspectMode;
  reframe: ReframeBox;
  fillMode: FillMode;
  /** 클립별 배속을 따로 주지 않은 구간에 적용되는 기본 배속 */
  globalSpeed: number;
  /** 배속을 걸어도 목소리 톤을 유지할지 */
  pitchPreserve: boolean;
  /** 자막을 음성보다 먼저 띄우는 시간(ms). 0이면 말과 동시에 뜬다 */
  captionLeadMs: number;
}

export const DEFAULT_PROJECT_VIEW: ProjectView = {
  aspectMode: 'original',
  reframe: { x: 0.5, y: 0.5, scale: 1 },
  fillMode: 'blur',
  globalSpeed: 1,
  pitchPreserve: true,
  captionLeadMs: 0,
};

/**
 * 되돌리기 대상이 되는 편집 문서. 원본 미디어는 여기 없다 — 편집 결정만 담는다.
 * v2: 편집의 단위는 EditClip + TranscriptWord(칩)다. SubtitleCue는 SRT 입출력 중간 표현으로만 쓴다.
 */
export interface EditorDoc {
  edl: EdlSegment[];
  clips: EditClip[];
  words: TranscriptWord[];
  style: SubtitleStyle;
  tracks: MosaicTrackDoc[];
  view: ProjectView;
}

/** SRT/VTT 입출력용 중간 표현 (저장하지 않는다) */
export type SubtitleCueLike = SubtitleCue;
