'use client';

import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';

const LANES = 3;

/** 인물(트랙)별 등장 구간. 빨강=가림, 초록 점선=가리지 않음 */
export function MosaicTrack() {
  const tracks = useProjectStore((s) => s.doc.tracks);
  const pxPerSec = useTimelineStore((s) => s.pxPerSec);
  const selected = useTimelineStore((s) => s.selectedTrackId);
  const laneH = 40 / LANES;

  return (
    <div className="relative h-10 border-b">
      {tracks.map((t, i) => (
        <div
          key={t.id}
          data-drag
          role="button"
          tabIndex={0}
          title={`${t.personLabel} ${t.enabled ? '(가림)' : '(가리지 않음)'}`}
          aria-label={`${t.personLabel} 등장 구간 선택`}
          onPointerDown={(e) => {
            e.stopPropagation();
            useTimelineStore.getState().selectTrack(t.id);
            useUiStore.getState().setPanel('mosaic');
          }}
          className={cn(
            'absolute cursor-pointer overflow-hidden rounded-sm text-[9px] leading-none text-white',
            t.enabled ? 'bg-red-500/60' : 'border border-dashed border-emerald-400 bg-emerald-500/15',
            selected === t.id && 'z-10 ring-2 ring-white',
          )}
          style={{
            top: (i % LANES) * laneH + 1,
            height: laneH - 2,
            left: (t.startMs / 1000) * pxPerSec,
            width: Math.max(4, ((t.endMs - t.startMs) / 1000) * pxPerSec),
          }}
        >
          <span className="pointer-events-none px-1">{t.personLabel}</span>
        </div>
      ))}
    </div>
  );
}
