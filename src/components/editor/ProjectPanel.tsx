'use client';

// 좌측 아래 "편집 프로젝트" 패널 (PRD-v2 F-02-5). 지금 무엇을 편집 중인지와 다른 영상으로 갈아타는 길.
import { StageOnePicker } from '@/components/pipeline/StageOnePicker';
import { OpenWithSrtButton } from '@/components/pipeline/OpenWithSrtButton';
import { useProjectStore } from '@/store/projectStore';
import { AspectControls } from './panels/AspectControls';

export function ProjectPanel() {
  const name = useProjectStore((s) => s.asset?.fileName ?? s.project?.name ?? '');
  const clipCount = useProjectStore((s) => s.doc.clips.length);

  return (
    <section aria-label="편집 프로젝트" className="shrink-0 space-y-2 border-t p-3 lg:border-r">
      <div>
        <p className="text-[11px] font-medium text-muted-foreground">편집 프로젝트</p>
        <p className="truncate text-sm" title={name}>{name || '열린 영상 없음'}</p>
        <p className="text-xs text-muted-foreground">{clipCount}개 자막 클립</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StageOnePicker />
        <OpenWithSrtButton />
      </div>
      {/* 우측 서식 패널의 비율 토글과 같은 값을 본다 (PRD-v2 F-04) */}
      <AspectControls compact />
    </section>
  );
}
