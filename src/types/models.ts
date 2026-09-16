// ERD 3.1장 도메인 타입. 순수 로직(lib/core 등)이 Dexie 런타임에 묶이지 않도록 db.ts와 분리해 둔다.

export type ProjectStatus = 'draft' | 'editing' | 'exporting' | 'done';

export interface Project {
  id: string;
  name: string;
  durationMs: number;         // EDL 적용 후 결과 길이
  sourceDurationMs: number;   // 원본 길이
  width: number;
  height: number;
  fps: number;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  kind: 'video' | 'audio' | 'image';
  fileName: string;
  fileSize: number;
  mimeType: string;
  opfsPath: string;
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  createdAt: number;
}

export type EdlOrigin = 'initial' | 'manual-split' | 'auto-silence' | 'auto-filler';

/** 최종 결과물을 구성하는 "유지할 구간" 목록. 이것이 편집의 원본 진실이다. */
export interface EdlSegment {
  id: string;
  projectId: string;
  assetId: string;
  order: number;
  sourceStartMs: number;
  sourceEndMs: number;
  enabled: boolean;
  origin: EdlOrigin;
  updatedAt: number;
}

export type SuggestionDecision = 'pending' | 'accepted' | 'rejected';

/** 자동 감지 결과. 사용자가 승인해야 EDL에 반영된다. */
export interface CutSuggestion {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  source: 'silence' | 'filler';
  confidence: number;
  label?: string;
  decision: SuggestionDecision;
}

export type SttEngineId = 'local-whisper' | 'groq' | 'gemini' | 'openai';

export interface Transcript {
  id: string;
  projectId: string;
  engine: SttEngineId | 'manual';
  model?: string;
  language: string;
  createdAt: number;
}

export interface TranscriptWord {
  id: string;
  transcriptId: string;
  idx: number;
  startMs: number;            // 원본 영상 기준
  endMs: number;
  text: string;
  confidence?: number;
  isFiller: boolean;
}

export interface SubtitleCue {
  id: string;
  projectId: string;
  idx: number;
  startMs: number;            // ⚠️ EDL 적용 후 "결과물 기준" 시간
  endMs: number;
  /** 원본 기준 앵커. EDL이 바뀌어도 여기서 결과물 시간을 다시 계산하므로 자막이 어긋나지 않는다. */
  sourceStartMs: number;
  sourceEndMs: number;
  /** 컷 편집으로 원본 구간이 전부 잘려 나간 큐. 삭제하지 않고 사용자에게 처리를 맡긴다. */
  orphan: boolean;
  text: string;
  textTranslated?: string;
  locked: boolean;
  styleOverride?: Partial<SubtitleStyle>;
}

export interface SubtitleStyle {
  id: string;
  projectId: string;
  fontFamily: string;
  fontSize: number;           // px, 가로 1920 기준
  fontWeight: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  shadowBlur: number;
  bgColor: string;
  bgOpacity: number;          // 0~1
  bgPaddingX: number;
  bgPaddingY: number;
  bgRadius: number;
  alignment: 'left' | 'center' | 'right';
  verticalPosition: 'top' | 'middle' | 'bottom';
  marginBottom: number;
  maxCharsPerLine: number;
  maxLines: number;
}

export type StyleValues = Omit<SubtitleStyle, 'id' | 'projectId'>;

export type MosaicMode = 'pixelate' | 'blur' | 'box' | 'emoji';

export interface MosaicTrack {
  id: string;
  projectId: string;
  personLabel: string;
  enabled: boolean;           // false면 이 사람은 안 가림
  mode: MosaicMode;
  intensity: number;          // pixelate: 블록 크기 / blur: 반경 (가로 1920 기준 px)
  scale: number;              // bbox 확대 배율
  shape: 'rect' | 'ellipse';
  emoji?: string;
  createdBy: 'auto' | 'manual';
  startMs: number;            // 원본 기준
  endMs: number;
  /** 대표 썸네일 (작은 JPEG data URL). 인물 목록에서 누가 누구인지 알아보기 위함 */
  thumbnail?: string;
}

export interface MosaicKeyframe {
  id: string;
  trackId: string;
  timeMs: number;             // 원본 기준
  x: number;                  // 0~1 정규화 좌표
  y: number;
  w: number;
  h: number;
  score: number;
  interpolated: boolean;
}

export interface Waveform {
  id: string;
  assetId: string;
  pointsPerSecond: number;
  peaks: ArrayBuffer;         // Int8Array min/max 쌍
}

export interface Thumbnail {
  id: string;
  assetId: string;
  timeMs: number;
  opfsPath: string;
}

export type ExportPreset = 'youtube-1080p' | 'youtube-720p' | 'shorts-1080x1920' | 'gif' | 'audio-only' | 'custom';
export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'mp3' | 'wav';
export type EncoderId = 'webcodecs' | 'ffmpeg-wasm';

export interface ExportJob {
  id: string;
  projectId: string;
  preset: ExportPreset;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  burnSubtitles: boolean;
  applyMosaic: boolean;
  encoder: EncoderId;
  status: 'queued' | 'running' | 'done' | 'failed' | 'aborted';
  progress: number;
  opfsPath?: string;
  errorCode?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface HistoryEntry {
  id: string;
  projectId: string;
  seq: number;
  commandType: string;
  inversePatch: string;
  createdAt: number;
}

export interface StylePresetRecord {
  id: string;
  name: string;
  style: StyleValues;
  builtIn: boolean;
  remoteId?: string;
  updatedAt: number;
}

export interface WordLike {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}
