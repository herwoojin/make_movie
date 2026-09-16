'use client';

import { ChevronLeft, ChevronRight, Headphones, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatShort } from '@/lib/core/timecode';
import { nudgeSegmentEdge, toggleSegmentById } from '@/lib/editor/actions';
import { player } from '@/lib/editor/player';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

/** 선택한 구간: 삭제/복원 + 컷 경계 1프레임 단위 미세 조정 + 경계 미리듣기 */
export function SegmentInspector() {
  const selectedId = useTimelineStore((s) => s.selectedSegmentId);
  const seg = useProjectStore((s) => s.doc.edl.find((x) => x.id === selectedId));
  if (!seg) return <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">영상 줄에서 구간을 누르면 삭제·경계 조정을 할 수 있습니다</span>;

  return (
    <div className="ml-auto flex flex-wrap items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
      <span className="tabular-nums">{formatShort(seg.sourceStartMs)}–{formatShort(seg.sourceEndMs)}</span>
      <Button size="sm" variant={seg.enabled ? 'ghost' : 'secondary'} onClick={() => toggleSegmentById(seg.id)} title="Delete 키">
        {seg.enabled ? <><Trash2 /> 삭제</> : <><RotateCcw /> 복원</>}
      </Button>
      <span className="ml-1 text-muted-foreground">시작</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => nudgeSegmentEdge(seg.id, 'start', -1)} aria-label="시작 경계 1프레임 앞으로"><ChevronLeft /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => nudgeSegmentEdge(seg.id, 'start', 1)} aria-label="시작 경계 1프레임 뒤로"><ChevronRight /></Button>
      <span className="text-muted-foreground">끝</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => nudgeSegmentEdge(seg.id, 'end', -1)} aria-label="끝 경계 1프레임 앞으로"><ChevronLeft /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => nudgeSegmentEdge(seg.id, 'end', 1)} aria-label="끝 경계 1프레임 뒤로"><ChevronRight /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" title="시작 경계 앞뒤 1초 듣기"
        onClick={() => player.playRange(Math.max(0, seg.sourceStartMs - 1000), seg.sourceStartMs + 1000)} aria-label="경계 미리듣기">
        <Headphones />
      </Button>
    </div>
  );
}
