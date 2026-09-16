// 렌더 루프용 원본→결과물 시각 변환. 프레임마다 호출되므로 edl.ts의 sourceToOutput(매번 정렬) 대신
// 미리 누적 오프셋을 계산해 두고 이진 탐색한다.
import type { TimeRange } from '@/types/models';

export interface OutputMapper {
  totalMs: number;
  /** 프레임은 [시작, 끝) 구간에 속해야 한다 — 경계 프레임이 두 번 들어가지 않게 */
  map(sourceMs: number): number | null;
}

export function createOutputMapper(ranges: readonly TimeRange[]): OutputMapper {
  const offsets: number[] = [];
  let acc = 0;
  for (const r of ranges) {
    offsets.push(acc);
    acc += r.endMs - r.startMs;
  }
  return {
    totalMs: acc,
    map(ms) {
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = ranges[mid];
        if (ms < r.startMs) hi = mid - 1;
        else if (ms >= r.endMs) lo = mid + 1;
        else return offsets[mid] + (ms - r.startMs);
      }
      return null;
    },
  };
}
