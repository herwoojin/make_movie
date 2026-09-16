'use client';

import { useMemo, useState, type PointerEvent } from 'react';
import { findOverlaps, setCueSourceTiming } from '@/lib/subtitle/model';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';

type Mode = 'move' | 'start' | 'end';
interface Drag { id: string; mode: Mode; originX: number; s0: number; e0: number; s: number; e: number }

const MIN_LEN = 100;
const snap = (ms: number) => Math.round(ms / 10) * 10;

/** 자막 블록: 끌어서 이동, 양 끝을 끌어서 길이 조절, 겹치면 빨간 테두리 */
export function SubtitleTrack() {
  const cues = useProjectStore((s) => s.doc.cues);
  const pxPerSec = useTimelineStore((s) => s.pxPerSec);
  const selected = useTimelineStore((s) => s.selectedCueId);
  const overlaps = useMemo(() => findOverlaps(cues), [cues]);
  const [drag, setDrag] = useState<Drag | null>(null);

  const begin = (e: PointerEvent<HTMLElement>, id: string, mode: Mode, s0: number, e0: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    useTimelineStore.getState().selectCue(id);
    useUiStore.getState().setPanel('subtitle');
    setDrag({ id, mode, originX: e.clientX, s0, e0, s: s0, e: e0 });
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const d = ((e.clientX - drag.originX) / pxPerSec) * 1000;
    let s = drag.s0;
    let en = drag.e0;
    if (drag.mode === 'move') { s = Math.max(0, snap(drag.s0 + d)); en = s + (drag.e0 - drag.s0); }
    if (drag.mode === 'start') s = Math.max(0, Math.min(snap(drag.s0 + d), drag.e0 - MIN_LEN));
    if (drag.mode === 'end') en = Math.max(snap(drag.e0 + d), drag.s0 + MIN_LEN);
    setDrag({ ...drag, s, e: en });
  };

  const end = () => {
    if (!drag) return;
    const { id, s, e, s0, e0 } = drag;
    setDrag(null);
    if (s === s0 && e === e0) return;
    useProjectStore.getState().edit('자막 시간 조정', (d) => {
      const i = d.cues.findIndex((c) => c.id === id);
      if (i >= 0) d.cues[i] = setCueSourceTiming(d.cues[i], s, e, d.edl);
    });
  };

  return (
    <div className="relative h-8 border-b">
      {cues.map((c) => {
        const s = drag?.id === c.id ? drag.s : c.sourceStartMs;
        const e = drag?.id === c.id ? drag.e : c.sourceEndMs;
        return (
          <div
            key={c.id}
            data-drag
            title={c.orphan ? `잘린 구간에 걸린 자막: ${c.text}` : c.text}
            onPointerDown={(ev) => begin(ev, c.id, 'move', c.sourceStartMs, c.sourceEndMs)}
            onPointerMove={move}
            onPointerUp={end}
            className={cn(
              'absolute top-1 flex h-6 cursor-grab items-center overflow-hidden rounded-sm border px-1 text-[11px] leading-none active:cursor-grabbing',
              c.orphan ? 'border-dashed border-red-400/60 bg-red-500/10 text-red-300' : 'border-sky-400/60 bg-sky-500/25 text-sky-100',
              overlaps.has(c.id) && 'border-2 border-red-500',
              selected === c.id && 'z-10 ring-2 ring-sky-300',
            )}
            style={{ left: (s / 1000) * pxPerSec, width: Math.max(4, ((e - s) / 1000) * pxPerSec) }}
          >
            <span className="pointer-events-none truncate">{c.text}</span>
            <span data-drag className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(ev) => begin(ev, c.id, 'start', c.sourceStartMs, c.sourceEndMs)} />
            <span data-drag className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(ev) => begin(ev, c.id, 'end', c.sourceStartMs, c.sourceEndMs)} />
          </div>
        );
      })}
    </div>
  );
}
