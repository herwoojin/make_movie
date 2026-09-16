// 브라우저 기능 감지 (TRD 3.1). 앱이 "느려도 동작은 하게" 어떤 경로를 탈지 이 결과로 정한다.

export type CapabilityKey = 'crossOriginIsolated' | 'sharedArrayBuffer' | 'webCodecs' | 'webGPU' | 'opfs';
export type CapabilityReport = Record<CapabilityKey, boolean>;

export interface CapabilityInfo {
  label: string;
  why: string;
  missing: string;
  /** critical: 없으면 편집 자체가 어렵다 / degraded: 느려지거나 일부 기능만 빠진다 */
  severity: 'critical' | 'degraded';
}

export const CAPABILITY_INFO: Record<CapabilityKey, CapabilityInfo> = {
  crossOriginIsolated: {
    label: '교차 출처 격리 (고속 처리 모드)',
    why: '여러 CPU 코어를 함께 써서 내보내기를 빠르게 합니다.',
    missing: '고속 처리 모드를 켤 수 없어 느린 모드로 동작합니다. 새로고침해 보세요.',
    severity: 'degraded',
  },
  sharedArrayBuffer: {
    label: '공유 메모리 (SharedArrayBuffer)',
    why: 'ffmpeg 멀티스레드 처리에 필요합니다.',
    missing: '예비 인코더(ffmpeg)가 한 코어만 써서 느려집니다.',
    severity: 'degraded',
  },
  webCodecs: {
    label: '하드웨어 영상 처리 (WebCodecs)',
    why: '그래픽카드로 영상을 빠르게 풀고 다시 압축합니다.',
    missing: '느린 예비 인코더로 내보냅니다. Chrome 또는 Edge 최신 버전을 권장합니다.',
    severity: 'critical',
  },
  webGPU: {
    label: '그래픽카드 연산 (WebGPU)',
    why: '자막 자동 생성(음성 인식)을 몇 배 빠르게 합니다.',
    missing: '자막 생성이 CPU로 돌아 느려집니다. 설정에서 Groq API 키를 넣으면 빨라집니다.',
    severity: 'degraded',
  },
  opfs: {
    label: '브라우저 전용 저장소 (OPFS)',
    why: '큰 영상 파일을 브라우저 안에 안전하게 보관합니다.',
    missing: '작업 중인 영상을 저장할 수 없어, 새로고침하면 영상을 다시 올려야 합니다.',
    severity: 'critical',
  },
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITY_INFO) as CapabilityKey[];

export function checkEnv(): CapabilityReport {
  if (typeof self === 'undefined') {
    return { crossOriginIsolated: false, sharedArrayBuffer: false, webCodecs: false, webGPU: false, opfs: false };
  }
  return {
    crossOriginIsolated: self.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webCodecs: typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' && typeof AudioDecoder !== 'undefined',
    webGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
    opfs: typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage,
  };
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
}

export interface EnvSummary {
  level: 'full' | 'degraded' | 'unsupported';
  title: string;
  messages: string[];
}

export function summarizeEnv(report: CapabilityReport, iosSafari = false): EnvSummary {
  const missing = CAPABILITY_KEYS.filter((k) => !report[k]);
  if (iosSafari) {
    return { level: 'unsupported', title: 'iPhone·iPad에서는 편집을 지원하지 않습니다', messages: ['데스크톱 Chrome 또는 Edge에서 열어 주세요. 도구함의 일부 기능은 쓸 수 있습니다.'] };
  }
  const critical = missing.filter((k) => CAPABILITY_INFO[k].severity === 'critical');
  if (critical.length === 2) {
    return { level: 'unsupported', title: '이 브라우저에서는 편집이 어렵습니다', messages: critical.map((k) => CAPABILITY_INFO[k].missing) };
  }
  if (missing.length > 0) {
    return { level: 'degraded', title: '일부 기능이 느리거나 제한됩니다', messages: missing.map((k) => CAPABILITY_INFO[k].missing) };
  }
  return { level: 'full', title: '모든 기능을 쓸 수 있습니다', messages: [] };
}
