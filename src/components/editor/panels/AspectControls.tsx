'use client';

// 화면 비율 (F-04). 원본은 건드리지 않고 그릴 때만 바꾼다 — 미리보기에 바로 보인다.
import type { AspectMode, FillMode } from '@/types/models';
import { SliderField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/projectStore';

const ASPECTS: [AspectMode, string][] = [['original', '원본'], ['16:9', '유튜브 16:9'], ['9:16', '쇼츠 9:16']];
const FILLS: [FillMode, string][] = [['blur', '블러 배경'], ['solid', '단색 배경'], ['crop', '잘라내기']];

export function AspectControls({ compact = false }: { compact?: boolean }) {
  const view = useProjectStore((s) => s.doc.view);
  const set = useProjectStore((s) => s.setView);

  return (
    <div className="space-y-2">
      <Segmented
        label="화면 비율"
        value={view.aspectMode}
        options={compact ? ASPECTS.map(([v, l]) => [v, l.replace('유튜브 ', '').replace('쇼츠 ', '')] as [AspectMode, string]) : ASPECTS}
        onChange={(v) => set({ aspectMode: v })}
      />
      {view.aspectMode !== 'original' && (
        <>
          <Segmented label="남는 자리 채우기" value={view.fillMode} options={FILLS} onChange={(v) => set({ fillMode: v })} />
          {view.fillMode === 'crop' ? (
            <>
              <p className="text-xs text-muted-foreground">미리보기 화면을 끌어서 보여줄 곳을 정하세요.</p>
              <SliderField
                label="확대"
                value={Math.round(view.reframe.scale * 100)}
                min={100}
                max={300}
                format={(v) => `${v}%`}
                onChange={(v) => set({ reframe: { ...view.reframe, scale: v / 100 } })}
              />
              <Button size="sm" variant="ghost" onClick={() => set({ reframe: { x: 0.5, y: 0.5, scale: 1 } })}>가운데로 되돌리기</Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {view.fillMode === 'blur' ? '남는 자리에 영상을 흐리게 깔아 채웁니다.' : '남는 자리를 검은색으로 채웁니다.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
