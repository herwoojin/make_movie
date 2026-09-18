// 모든 에러는 "사용자가 다음에 무엇을 하면 되는지(hint)"를 함께 가져간다 (TRD 8장).

export type AppErrorCode =
  | 'UNSUPPORTED_BROWSER' | 'NOT_CROSS_ORIGIN_ISOLATED'
  | 'FILE_TOO_LARGE' | 'UNSUPPORTED_CODEC' | 'UNSUPPORTED_FORMAT' | 'QUOTA_EXCEEDED'
  | 'DECODE_FAILED' | 'ENCODE_FAILED' | 'OOM' | 'NO_AUDIO_TRACK'
  | 'STT_MODEL_LOAD_FAILED' | 'STT_API_ERROR' | 'API_KEY_INVALID'
  | 'TRANSLATE_FAILED' | 'NETWORK_FAILED'
  | 'VISION_LOAD_FAILED' | 'NOT_FOUND' | 'STORAGE_FAILED'
  | 'AUTH_REQUIRED' | 'AUTH_FAILED' | 'SYNC_FAILED'
  | 'ABORTED' | 'UNKNOWN';

export interface AppErrorShape {
  code: AppErrorCode;
  message: string;
  hint: string;
}

const DEFAULTS: Record<AppErrorCode, Omit<AppErrorShape, 'code'>> = {
  UNSUPPORTED_BROWSER: { message: '이 브라우저에서는 편집 기능을 쓸 수 없습니다.', hint: '데스크톱 Chrome 또는 Edge 최신 버전으로 열어 주세요.' },
  NOT_CROSS_ORIGIN_ISOLATED: { message: '고속 처리 모드(멀티스레드)를 켤 수 없습니다.', hint: '페이지를 새로고침해 보세요. 계속되면 느린 모드로 동작합니다.' },
  FILE_TOO_LARGE: { message: '파일이 너무 커서 브라우저에서 처리하기 어렵습니다.', hint: '20분 이하로 나눠서 올려 주세요.' },
  UNSUPPORTED_CODEC: { message: '이 브라우저가 영상의 압축 방식(코덱)을 지원하지 않습니다.', hint: 'WebM으로 내보내거나 Chrome을 써보세요.' },
  UNSUPPORTED_FORMAT: { message: '지원하지 않는 파일 형식입니다.', hint: 'MP4, MOV, WebM 영상 파일을 올려 주세요.' },
  QUOTA_EXCEEDED: { message: '브라우저 저장공간이 부족합니다.', hint: '설정 > 저장공간 정리에서 오래된 프로젝트를 지워보세요.' },
  DECODE_FAILED: { message: '영상을 읽는 중 문제가 생겼습니다.', hint: '다른 파일로 시도하거나, 영상을 MP4(H.264)로 변환한 뒤 올려 주세요.' },
  ENCODE_FAILED: { message: '내보내기 중 문제가 생겼습니다.', hint: '해상도를 낮추거나 WebM으로 내보내 보세요. 계속되면 설정에서 인코더를 ffmpeg로 바꿔 보세요.' },
  OOM: { message: '메모리가 부족합니다.', hint: '다른 탭을 닫고, 영상을 짧게 나눠서 처리해 주세요.' },
  NO_AUDIO_TRACK: { message: '이 영상에는 소리가 없습니다.', hint: '소리가 있는 영상에서만 무음 감지·자막 생성을 쓸 수 있습니다.' },
  STT_MODEL_LOAD_FAILED: { message: '음성 인식 모델을 불러오지 못했습니다.', hint: '인터넷 연결을 확인하고 다시 시도하거나, 설정에서 Groq API 키를 넣어 보세요.' },
  STT_API_ERROR: { message: '음성 인식 서비스가 응답하지 않았습니다.', hint: '잠시 후 다시 시도하거나 브라우저 내장 엔진으로 바꿔 보세요.' },
  API_KEY_INVALID: { message: 'API 키가 올바르지 않습니다.', hint: '설정에서 키를 다시 확인해 주세요.' },
  TRANSLATE_FAILED: { message: '번역하지 못했습니다.', hint: '번역 엔진을 바꾸거나 잠시 후 다시 시도해 주세요.' },
  NETWORK_FAILED: { message: '인터넷 연결이 필요한 작업에 실패했습니다.', hint: '연결을 확인한 뒤 다시 시도해 주세요.' },
  VISION_LOAD_FAILED: { message: '얼굴 검출 엔진을 불러오지 못했습니다.', hint: '새로고침 후 다시 시도해 주세요. 계속되면 수동 사각형으로 가려 주세요.' },
  NOT_FOUND: { message: '대상을 찾을 수 없습니다.', hint: '프로젝트 목록에서 다시 열어 주세요.' },
  STORAGE_FAILED: { message: '파일을 저장하지 못했습니다.', hint: '시크릿 모드가 아닌지 확인하고, 설정 > 저장공간 정리에서 공간을 비워 보세요.' },
  AUTH_REQUIRED: { message: '로그인이 필요합니다.', hint: '오른쪽 위 "로그인"을 눌러 Google 계정으로 로그인해 주세요.' },
  AUTH_FAILED: { message: '로그인하지 못했습니다.', hint: '잠시 후 다시 시도해 주세요. 로그인하지 않아도 모든 편집 기능은 쓸 수 있습니다.' },
  SYNC_FAILED: { message: '동기화하지 못했습니다.', hint: '잠시 후 다시 시도해 주세요. 데이터는 이 브라우저에 그대로 남아 있습니다.' },
  ABORTED: { message: '작업을 취소했습니다.', hint: '필요하면 다시 시작하세요.' },
  UNKNOWN: { message: '알 수 없는 문제가 생겼습니다.', hint: '새로고침 후 다시 시도해 주세요.' },
};

export class AppError extends Error implements AppErrorShape {
  readonly code: AppErrorCode;
  readonly hint: string;

  constructor(code: AppErrorCode, message?: string, hint?: string) {
    super(message ?? DEFAULTS[code].message);
    this.name = 'AppError';
    this.code = code;
    this.hint = hint ?? DEFAULTS[code].hint;
  }

  toJSON(): AppErrorShape {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

export function isAppErrorShape(x: unknown): x is AppErrorShape {
  return typeof x === 'object' && x !== null
    && typeof (x as Record<string, unknown>).code === 'string'
    && typeof (x as Record<string, unknown>).message === 'string'
    && typeof (x as Record<string, unknown>).hint === 'string';
}

/** 워커·브라우저 API가 던지는 제각각의 에러를 사용자에게 보여줄 수 있는 형태로 통일한다. */
export function toAppError(e: unknown, fallback: AppErrorCode = 'UNKNOWN'): AppError {
  if (e instanceof AppError) return e;
  if (isAppErrorShape(e)) return new AppError(e.code, e.message, e.hint);
  const name = typeof e === 'object' && e !== null ? String((e as { name?: unknown }).name ?? '') : '';
  if (name === 'AbortError') return new AppError('ABORTED');
  if (name === 'QuotaExceededError') return new AppError('QUOTA_EXCEEDED');
  if (e instanceof RangeError && /memory|allocation/i.test(e.message)) return new AppError('OOM');
  const detail = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const base = DEFAULTS[fallback];
  return new AppError(fallback, detail ? `${base.message} (${detail})` : base.message, base.hint);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError('ABORTED');
}
