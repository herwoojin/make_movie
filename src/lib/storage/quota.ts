// 저장공간 여유 확인 (ERD 4장 용량 관리 규칙). 원본 복사 + PCM 캐시 + 내보내기 결과를 고려해 원본의 3배를 요구한다.
import { AppError } from '@/lib/errors';
import { formatBytes } from '@/lib/utils';

export const ROOM_FACTOR = 3;

export interface StorageEstimateLite {
  usage: number;
  quota: number;
}

export function freeBytes(est: StorageEstimateLite): number {
  return Math.max(0, est.quota - est.usage);
}

export function hasRoomFor(est: StorageEstimateLite, sourceBytes: number, factor = ROOM_FACTOR): boolean {
  return freeBytes(est) >= sourceBytes * factor;
}

export function usageRatio(est: StorageEstimateLite): number {
  return est.quota > 0 ? Math.min(1, est.usage / est.quota) : 0;
}

export async function getEstimate(): Promise<StorageEstimateLite | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

/** 공간이 부족하면 QUOTA_EXCEEDED. 추정치를 못 얻는 브라우저에서는 막지 않는다(실제 쓰기에서 다시 잡힌다). */
export async function ensureRoomFor(sourceBytes: number): Promise<void> {
  const est = await getEstimate();
  if (!est || est.quota === 0) return;
  if (!hasRoomFor(est, sourceBytes)) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      `저장공간이 부족합니다. 필요: ${formatBytes(sourceBytes * ROOM_FACTOR)} / 남은 공간: ${formatBytes(freeBytes(est))}`,
      '설정 > 저장공간 정리에서 오래된 프로젝트를 지워보세요',
    );
  }
}

/** 브라우저가 공간 압박 시 데이터를 임의로 지우지 않도록 영구 저장을 요청 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
