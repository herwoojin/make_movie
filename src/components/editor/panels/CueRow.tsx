'use client';

import { Link2, Lock, LockOpen, Scissors, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { SubtitleCue } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/misc';
import { formatShort } from '@/lib/core/timecode';
import { seekTo } from '@/lib/editor/actions';
import { mergeWithNext, renumberCues, splitCue } from '@/lib/subtitle/model';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

function setText(id: string, text: string, label: string | null): void {
  useProjectStore.getState().edit(label ?? '', (d) => {
    const c = d.cues.find((x) => x.id === id);
    if (c) c.text = text;
  }, { history: label !== null });
}

export const CueRow = memo(function CueRow({ cue, active, overlap, isLast }: { cue: SubtitleCue; active: boolean; overlap: boolean; isLast: boolean }) {
  const [text, setLocal] = useState(cue.text);
  const original = useRef(cue.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (document.activeElement !== ref.current) setLocal(cue.text); }, [cue.text]);

  const edit = useProjectStore.getState().edit;

  return (
    <li className={cn('rounded-md border p-2', active && 'border-sky-400 bg-sky-500/10', overlap && 'border-red-500/70')}>
      <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <button type="button" className="tabular-nums hover:text-foreground" onClick={() => { seekTo(cue.sourceStartMs); useTimelineStore.getState().selectCue(cue.id); }}>
          {formatShort(cue.startMs)} – {formatShort(cue.endMs)}
        </button>
        {overlap && <span className="text-red-400">겹침</span>}
        <div className="ml-auto flex">
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="커서 위치에서 나누기" title="커서 위치에서 나누기"
            onClick={() => edit('자막 나누기', (d) => { d.cues = splitCue(d.cues, cue.id, ref.current?.selectionStart ?? Math.floor(cue.text.length / 2)); })}>
            <Scissors />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="다음 자막과 합치기" title="다음 자막과 합치기" disabled={isLast}
            onClick={() => edit('자막 합치기', (d) => { d.cues = mergeWithNext(d.cues, cue.id); })}>
            <Link2 />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={cue.locked ? '잠금 풀기' : '잠그기 (자막을 다시 만들어도 유지)'} title={cue.locked ? '잠금 풀기' : '잠그기: 자막을 다시 만들어도 유지'}
            onClick={() => edit(cue.locked ? '자막 잠금 해제' : '자막 잠금', (d) => { const c = d.cues.find((x) => x.id === cue.id); if (c) c.locked = !c.locked; })}>
            {cue.locked ? <Lock /> : <LockOpen />}
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400" aria-label="자막 삭제"
            onClick={() => edit('자막 삭제', (d) => { d.cues = renumberCues(d.cues.filter((c) => c.id !== cue.id)); })}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <Textarea
        ref={ref}
        rows={2}
        value={text}
        aria-label={`${formatShort(cue.startMs)} 자막 글자`}
        onFocus={() => { original.current = cue.text; }}
        onChange={(e) => { setLocal(e.target.value); setText(cue.id, e.target.value, null); }}
        onBlur={() => {
          // 입력 중에는 미리보기에 즉시 반영하고(기록 없음), 포커스가 빠질 때 한 번만 되돌리기 단계로 남긴다
          if (original.current === text) return;
          setText(cue.id, original.current, null);
          setText(cue.id, text, '자막 글자 수정');
          original.current = text;
        }}
      />
    </li>
  );
});
