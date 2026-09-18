// ERD 3.1장 도메인 타입. 순수 로직(lib/core 등)이 Dexie 런타임에 묶이지 않도록 db.ts와 분리해 둔다.

export type ProjectStatus = 'draft' | 'editing' | 'exporting' | 'done';

/** v2: 화면 비율은 편집 중에 바꾼다. 원본은 건드리지 않고 렌더 시점 변환으로만 처리한다 */
export type AspectMode = 'original' | '16:9' | '9:16';
export type FillMode = 'blur' | 'solid' | 'crop';

/** 비율을 바꿨을 때 "원본의 어느 부분을 보여줄지" (0~1 정규화 중심 + 배율) */
export interface ReframeBox {
  x: number;
  y: number;
  scale: number;
}

export type PipelineStage = 1 | 2;
export type SourceTool = 'auto-edit' | 'translate' | 'import' | 'dub' | 'mosaic';

export interface Project {
  id: string;
  name: string;
  durationMs: number;         // EDL + 배속 적용 후 결과 길이
  sourceDurationMs: number;   // 원본 길이
  width: number;
  height: number;
  fps: number;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  // ── v2 ─────────────────────────────────────────────
  aspectMode: AspectMode;
  reframe: ReframeBox;
  fillMode: FillMode;
  globalSpeed: number;
  pitchPreserve: boolean;
  pipelineStage: PipelineStage;
  sourceTool: SourceTool;
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
  // ── v2: 단어 칩 편집 ────────────────────────────────
  /** 어느 클립(자막 한 줄)에 속하는지 */
  clipId: string;
  /** 사용자가 ⊗로 지웠는가. 실제 삭제가 아니라 플래그 — 원본 배열은 보존한다 */
  deleted: boolean;
  /** 되돌리기 순서용 */
  deletedAt?: number;
}

export type ClipSourceKind = 'video-edit' | 'source-audio';

/** v2 편집의 기본 단위: 자막 한 줄 + 그에 속한 단어들 + 시간 구간 */
export interface EditClip {
  id: string;
  projectId: string;
  idx: number;                    // 화면 표시 번호 (0부터, UI에서 +1)
  sourceKind: ClipSourceKind;     // 배지: '영상편집' | '원어 음성'
  sourceStartMs: number;          // 원본 기준 시작
  sourceEndMs: number;            // 원본 기준 끝
  captionText: string;            // 하단 자막 줄 (사용자 수정 가능)
  captionTextOriginal: string;    // 단어에서 자동 생성된 원본 (되돌리기용)
  captionEdited: boolean;         // 사용자가 직접 고쳤는가
  translatedText?: string;        // 번역 모드일 때 한국어 자막
  enabled: boolean;               // false = 클립 전체 제외
  speed: number;                  // 배속 (1.0 = 원속도)
  /** 이 클립만의 서식. 별도 테이블 대신 클립에 직접 담는다(두 곳을 동기화하면 버그가 난다) */
  styleOverride?: Partial<SubtitleStyle>;
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
  italic: boolean;            // v2
  color: string;
  outlineEnabled: boolean;    // v2: 색·두께와 별개로 켜고 끄기
  outlineColor: string;
  outlineWidth: number;
  bgEnabled: boolean;         // v2
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
  /** 직접 그린 영역: 고정(영상 내내 같은 자리) / 움직임(시점마다 자리 기록). 없으면 고정 */
  motion?: 'static' | 'moving';
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

// ── v2 신규 테이블 ─────────────────────────────────────────────────────────

export type SavedResultKind = 'video' | 'gif' | 'audio' | 'subtitle' | 'image' | 'document';

/** 최근 저장 결과 (F-11). 도구가 늘어날수록 "방금 만든 그 파일"을 다시 찾기 어려워진다 */
export interface SavedResult {
  id: string;
  kind: SavedResultKind;
  toolId: string;              // 'auto-edit' | 'translate' | 'tts' | 'compress' | ...
  fileName: string;
  fileSize: number;
  durationMs?: number;
  opfsPath?: string;           // 브라우저 저장분
  localPath?: string;          // 사이드카 저장분
  thumbnail?: string;          // 작은 미리보기 (data URL)
  projectId?: string;          // 되돌아가서 재편집할 프로젝트
  createdAt: number;
}

export type VoiceEmotion = 'default' | 'calm' | 'bright' | 'serious' | 'sad' | 'emphatic';

/** 감정별 참조 음성 (F-08). 감정은 프롬프트가 아니라 "그 감정으로 녹음해둔 샘플"로 표현한다 */
export interface VoiceProfile {
  id: string;
  emotion: VoiceEmotion;
  label: string;
  opfsPath: string;            // 녹음 WAV
  refText: string;             // 그 녹음에서 읽은 문장
  sampleRate: number;
  durationMs: number;
  updatedAt: number;
}

/** 용어 지정 (F-07). "Sunburst=선버스트" 같은 고유명사 대응표 */
export interface Glossary {
  id: string;
  name: string;
  entries: { from: string; to: string }[];
  updatedAt: number;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}
