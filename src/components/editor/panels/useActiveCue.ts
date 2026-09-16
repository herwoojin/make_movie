'use client';

import { sourceToOutput } from '@/lib/core/edl';
import { activeCueAt } from '@/lib/subtitle/model';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

/** 재생 위치의 자막 id. 재생 중 매 프레임 목록 전체가 다시 그려지지 않도록 id가 바뀔 때만 리렌더된다 */
export function useActiveCueId(): string | null {
  return useTimelineStore((s) => {
    const { doc } = useProjectStore.getState();
    const out = sourceToOutput(s.currentMs, doc.edl);
    return out === null ? null : activeCueAt(doc.cues, out)?.id ?? null;
  });
}
