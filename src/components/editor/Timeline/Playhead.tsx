'use client';

import { useTimelineStore } from '@/store/timelineStore';

export function Playhead() {
  const ms = useTimelineStore((s) => s.currentMs);
  const px = useTimelineStore((s) => s.pxPerSec);
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ transform: `translateX(${(ms / 1000) * px}px)` }}>
      <div className="absolute -left-[5px] -top-[5px] h-[11px] w-[11px] rotate-45 bg-red-500" />
    </div>
  );
}
