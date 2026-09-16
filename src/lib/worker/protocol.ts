// Worker 통신 규약 (TRD 5장). 요청 { id, type, payload } / 응답 { id, status, ... }
import type { AppErrorShape } from '@/lib/errors';

export type ProgressPhase = 'download' | 'decode' | 'analyze' | 'transcribe' | 'detect' | 'render' | 'mux' | 'write';

export interface Progress {
  phase: ProgressPhase;
  done: number;
  total: number;
  etaMs?: number;
  message?: string;
}

export interface WorkerRequest<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

export type WorkerResponse<T = unknown> =
  | { id: string; status: 'progress'; progress: Progress }
  | { id: string; status: 'done'; result: T }
  | { id: string; status: 'error'; error: AppErrorShape };

/** 진행 중인 요청 취소. payload 없이 같은 id로 보낸다 */
export const CANCEL_TYPE = '__cancel__';

/** 워커별 API 정의: 요청 type → payload/result 타입 */
export type WorkerApi = Record<string, { payload: unknown; result: unknown }>;

export function progressRatio(p: Progress | null | undefined): number {
  if (!p || p.total <= 0) return 0;
  return Math.min(1, Math.max(0, p.done / p.total));
}

/** 경과 시간과 진행률로 남은 시간 추정 */
export function estimateEta(startedAt: number, ratio: number, now = Date.now()): number | undefined {
  if (ratio <= 0.01) return undefined;
  const elapsed = now - startedAt;
  return Math.max(0, Math.round(elapsed / ratio - elapsed));
}
