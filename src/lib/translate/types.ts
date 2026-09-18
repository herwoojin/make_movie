// 번역 어댑터 (PRD-v2 F-07). v1의 SttAdapter와 같은 패턴 — 엔진이 바뀌어도 화면은 그대로다.
export type TranslateTone = 'literal' | 'friendly' | 'formal' | 'casual';
export type TranslateMode = 'fast' | 'precise';
export type TranslateEngineId = 'gemini' | 'deepl' | 'local-llm';

export interface TranslateCue {
  start: number;
  end: number;
  text: string;
}

export interface TranslatedCue extends TranslateCue {
  translated: string;
}

export interface TranslateOptions {
  sourceLang: string;
  targetLang: 'ko';
  tone: TranslateTone;
  /** 고유명사 대응표 (원어 → 한국어) */
  glossary: Record<string, string>;
  mode: TranslateMode;
  onProgress?: (done: number, total: number, message?: string) => void;
  signal?: AbortSignal;
}

export interface TranslateAdapter {
  id: TranslateEngineId;
  displayName: string;
  requiresApiKey: boolean;
  requiresSidecar: boolean;
  isAvailable(): Promise<boolean>;
  translate(cues: readonly TranslateCue[], opts: TranslateOptions): Promise<TranslatedCue[]>;
}

export interface TranslateEngineMeta {
  id: TranslateEngineId;
  displayName: string;
  description: string;
  requiresApiKey: boolean;
  requiresSidecar: boolean;
  /** 원문이 이 브라우저 밖(외부 서버)으로 나가는가 — 사용자에게 먼저 알린다 */
  sendsTextToServer: boolean;
}

export const TRANSLATE_ENGINES: Record<TranslateEngineId, TranslateEngineMeta> = {
  gemini: {
    id: 'gemini',
    displayName: 'Gemini (내 API 키)',
    description: '무료 사용량이 넉넉하고 품질이 좋습니다. 자막 글자만 구글 서버로 전송됩니다(영상은 보내지 않습니다).',
    requiresApiKey: true,
    requiresSidecar: false,
    sendsTextToServer: true,
  },
  deepl: {
    id: 'deepl',
    displayName: 'DeepL (내 API 키)',
    description: '번역 품질이 아주 좋습니다. 브라우저에서 바로 부를 수 없는 경우가 있어 실패하면 내 컴퓨터 도우미가 필요합니다.',
    requiresApiKey: true,
    requiresSidecar: false,
    sendsTextToServer: true,
  },
  'local-llm': {
    id: 'local-llm',
    displayName: '내 컴퓨터에서 번역 (Ollama)',
    description: '내 컴퓨터 도우미가 켜져 있으면 인터넷으로 아무것도 보내지 않고 번역합니다.',
    requiresApiKey: false,
    requiresSidecar: true,
    sendsTextToServer: false,
  },
};

export const TONE_LABELS: Record<TranslateTone, string> = {
  literal: '원문 말투 유지',
  friendly: '친근하게',
  formal: '격식체',
  casual: '구어체',
};

export const MODE_LABELS: Record<TranslateMode, string> = {
  fast: '빠르게 · 문장별 즉시',
  precise: '정밀 · 번역 후 전체 재검수',
};
