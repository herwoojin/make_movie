'use client';

import { Crosshair } from 'lucide-react';
import { useMemo } from 'react';
import type { SubtitleCue } from '@/types/models';
import { Button } from '@/components/ui/button';
import { sourceToOutput } from '@/lib/core/edl';
import { formatTimecode } from '@/lib/core/timecode';
import { seekTo } from '@/lib/editor/actions';
import { findOverlaps, setCueTiming } from '@/lib/subtitle/model';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { useActiveCueId } from './useActiveCue';

type Edge = 'start' | 'end';

function retime(id: string, next: (c: SubtitleCue) => [number, number]): void {
  useProjectStore.getState().edit('자막 시간 조정', (d) => {
    const i = d.cues.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [s, e] = next(d.cues[i]);
    d.cues[i] = setCueTiming(d.cues[i], s, e, d.edl);
  });
}

function toPlayhead(id: string, edge: Edge): void {
  const { doc } = useProjectStore.getState();
  const out = sourceToOutput(useTimelineStore.getState().currentMs, doc.edl);
  if (out === null) {
    useUiStore.getState().toast({ kind: 'info', title: '재생헤드가 잘린 구간에 있어 맞출 수 없습니다.' });
    return;
  }
  retime(id, (c) => (edge === 'start' ? [out, Math.max(c.endMs, out + 100)] : [Math.min(c.startMs, out - 100), out]));
}

function EdgeControl({ cue, edge }: { cue: SubtitleCue; edge: Edge }) {
  const value = edge === 'start' ? cue.startMs : cue.endMs;
  const shift = (delta: number) => retime(cue.id, (c) => (edge === 'start' ? [c.startMs + delta, c.endMs] : [c.startMs, c.endMs + delta]));
  return (
    <div className="flex items-center gap-0.5">
      <span className="w-6 text-muted-foreground">{edge === 'start' ? '시작' : '끝'}</span>
      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => shift(-100)} aria-label={`${edge === 'start' ? '시작' : '끝'} 0.1초 앞당기기`}>−0.1</Button>
      <span className="font-mono tabular-nums">{formatTimecode(value, true).slice(3)}</span>
      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => shift(100)} aria-label={`${edge === 'start' ? '시작' : '끝'} 0.1초 늦추기`}>+0.1</Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toPlayhead(cue.id, edge)} title="현재 재생 위치로 맞추기" aria-label={`${edge === 'start' ? '시작' : '끝'}을 현재 재생 위치로 맞추기`}>
        <Crosshair />
      </Button>
    </div>
  );
}

export function SubtitleTimingTab() {
  const cues = useProjectStore((s) => s.doc.cues);
  const selected = useTimelineStore((s) => s.selectedCueId);
  const activeId = useActiveCueId();
  const live = useMemo(() => cues.filter((c) => !c.orphan).sort((a, b) => a.startMs - b.startMs), [cues]);
  const overlaps = useMemo(() => findOverlaps(cues), [cues]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ±0.1초 버튼으로 맞추거나, 재생하다 멈추고 ⌖(현재 위치로)를 누르세요. 타임라인의 자막 줄에서 블록을 끌어 옮기거나 양 끝을 끌어 길이를 바꿀 수도 있습니다.
      </p>
      <ul className="space-y-1.5">
        {live.map((c) => (
          <li key={c.id} className={cn('space-y-1 rounded-md border p-2 text-xs', (c.id === selected || c.id === activeId) && 'border-sky-400 bg-sky-500/10', overlaps.has(c.id) && 'border-red-500/70')}>
            <button type="button" className="block w-full truncate text-left text-sm" onClick={() => { seekTo(c.sourceStartMs); useTimelineStore.getState().selectCue(c.id); }}>
              {c.text}
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <EdgeControl cue={c} edge="start" />
              <EdgeControl cue={c} edge="end" />
            </div>
            {overlaps.has(c.id) && <p className="text-red-400">⚠ 앞뒤 자막과 시간이 겹칩니다.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
