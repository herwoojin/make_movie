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
  /** 0~1 전사 진행률 */
  onProgress?: (p: number) => void;
  /** 모델 다운로드 진행 (바이트) — 사용자가 150MB를 받는 중이라는 걸 알아야 한다 */
  onDownload?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
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
