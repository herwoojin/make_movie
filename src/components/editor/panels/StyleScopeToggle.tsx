'use client';

// 서식을 "체크한 클립만" 바꿀지 "영상 전체"를 바꿀지 (PRD-v2 F-03). 배속 탭도 같은 범위를 쓴다.
import { Segmented } from '@/components/ui/segmented';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore, type StyleScope } from '@/store/uiStore';

export function StyleScopeToggle() {
  const scope = useUiStore((s) => s.styleScope);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const numbers = useProjectStore((s) => s.doc.clips.filter((c) => selectedIds.includes(c.id)).map((c) => c.idx + 1));

  return (
    <div className="space-y-1">
      <Segmented
        label="서식 적용 범위"
        value={scope}
        options={[['clips', '선택 클립'], ['all', '영상 전체']] as [StyleScope, string][]}
        onChange={(v) => useUiStore.getState().setStyleScope(v)}
      />
      <p className="text-xs text-muted-foreground">
        {scope === 'all'
          ? '모든 자막 클립에 적용됩니다. 클립별로 따로 준 서식은 지워집니다.'
          : numbers.length === 0
            ? '클립을 먼저 선택하세요. 가운데 목록에서 왼쪽 체크박스를 누르면 됩니다.'
            : `${numbers.length}개 클립 선택 · ${numbers.slice(0, 6).join('번, ')}번${numbers.length > 6 ? ' …' : ''}`}
      </p>
    </div>
  );
}
