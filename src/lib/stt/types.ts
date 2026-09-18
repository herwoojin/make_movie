// STT 어댑터 인터페이스 (TRD 4.4). 시간은 전부 ms 정수, 원본 영상 기준.
import type { SttEngineId } from '@/types/models';

export interface SttSegment { start: number; end: number; text: string }
export interface SttWord { start: number; end: number; text: string; confidence?: number }

export interface SttResult {
  segments: SttSegment[];
  words: SttWord[];
  language: string;
}

export interface SttTranscribeOptions {
  language?: string;
  /** 브라우저 내장 Whisper 모델 저장소 이름 (크기 선택) */
  model?: string;
  /** 0~1 전사 진행률 */
  onProgress?: (p: number) => void;
  /** 모델 다운로드 진행 (바이트) — 사용자가 150MB를 받는 중이라는 걸 알아야 한다 */
  onDownload?: (loaded: number, total: number) => void;
  /** 서버가 파일 크기를 알려주지 않을 때 쓰는 예상 다운로드 크기 (바이트) */
  expectedDownloadBytes?: number;
  /** 인식 중인 구간과 방금 알아들은 말 — "정말 돌아가고 있다"를 보여 주기 위해 */
  onPartial?: (p: SttPartial) => void;
  signal?: AbortSignal;
}

export interface SttPartial {
  /** 몇 번째 구간인지 (0부터) */
  chunk: number;
  chunks: number;
  fromMs: number;
  toMs: number;
  /** 이 구간에서 지금까지 알아들은 말 */
  text: string;
  /** 전체 진행 비율 (0~1) — 구간 안에서도 조금씩 움직인다 */
  ratio: number;
  /** 이 구간 인식이 끝났을 때 한 번 (완성된 문장) — 화면 갱신 간격 조절에서 버리면 안 된다 */
  final?: boolean;
}

export interface SttAdapter {
  id: SttEngineId;
  displayName: string;
  requiresApiKey: boolean;
  /** true면 사용 직전에 "오디오가 외부 서버로 전송됩니다" 모달로 고지해야 한다 */
  sendsAudioToServer: boolean;
  providerName?: string;
  isAvailable(): Promise<boolean>;
  transcribe(pcm: Float32Array, opts: SttTranscribeOptions): Promise<SttResult>;
}

export interface SttEngineMeta {
  id: 'local-whisper' | 'groq';
  displayName: string;
  description: string;
  requiresApiKey: boolean;
  sendsAudioToServer: boolean;
  providerName?: string;
}

/** UI가 워커를 띄우기 전에 알아야 하는 정보(고지 모달 여부 등) */
export const STT_ENGINES: Record<SttEngineMeta['id'], SttEngineMeta> = {
  'local-whisper': {
    id: 'local-whisper',
    displayName: '브라우저 내장 (무료)',
    description: '인터넷으로 오디오를 보내지 않습니다. 처음 한 번 음성 인식 파일(약 150MB)을 내려받습니다.',
    requiresApiKey: false,
    sendsAudioToServer: false,
  },
  groq: {
    id: 'groq',
    displayName: 'Groq (내 API 키)',
    description: '매우 빠르지만, 오디오가 Groq 서버로 전송됩니다.',
    requiresApiKey: true,
    sendsAudioToServer: true,
    providerName: 'Groq',
  },
};
