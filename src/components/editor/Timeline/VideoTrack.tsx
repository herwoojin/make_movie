'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { sortSegments } from '@/lib/core/edl';
import { formatShort } from '@/lib/core/timecode';
import { toggleSegmentById } from '@/lib/editor/actions';
import { loadOrCreateThumbnails } from '@/lib/editor/importPipeline';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useStickyCanvas } from './useStickyCanvas';

export function VideoTrack({ scrollRef }: { scrollRef: RefObject<HTMLDivElement> }) {
  const edl = useProjectStore((s) => s.doc.edl);
  const sourceUrl = useProjectStore((s) => s.sourceUrl);
  const pxPerSec = useTimelineStore((s) => s.pxPerSec);
  const selected = useTimelineStore((s) => s.selectedSegmentId);
  const thumbs = useRef(new Map<number, ImageBitmap>());
  const listeners = useRef(new Set<() => void>());

  const canvasRef = useStickyCanvas(scrollRef, (ctx, { scrollLeft, width, height, pxPerSec: px }) => {
    const entries = [...thumbs.current.entries()].sort((a, b) => a[0] - b[0]);
    if (entries.length === 0) return;
    const interval = entries.length > 1 ? entries[1][0] - entries[0][0] : 1000;
    const first = entries[0][1];
    const tileW = Math.max(8, (first.width / first.height) * height);
    // 확대 정도와 상관없이 썸네일 비율을 유지한 타일로 채운다: 각 타일 위치의 가장 가까운 썸네일을 그린다
    for (let x = -(scrollLeft % tileW); x < width; x += tileW) {
      const ms = ((scrollLeft + x + tileW / 2) / px) * 1000;
      const idx = Math.min(entries.length - 1, Math.max(0, Math.floor(ms / interval)));
      ctx.drawImage(entries[idx][1], x, 0, tileW, height);
    }
  }, (schedule) => {
    listeners.current.add(schedule);
    return () => { listeners.current.delete(schedule); };
  });

  useEffect(() => {
    const { project, asset, source } = useProjectStore.getState();
    if (!project || !asset || !source) return;
    const ctrl = new AbortController();
    const map = thumbs.current;
    void loadOrCreateThumbnails(project.id, asset, source, ({ timeMs, bitmap }) => {
      map.set(timeMs, bitmap);
      listeners.current.forEach((l) => l());
    }, ctrl.signal);
    return () => {
      ctrl.abort();
      map.forEach((b) => b.close());
      map.clear();
    };
  }, [sourceUrl]);

  return (
    <div className="relative h-12 border-b" data-row="video">
      <div className="sticky left-0 h-full w-0">
        <canvas ref={canvasRef} className="absolute left-0 top-0 block opacity-50" />
      </div>
      {sortSegments(edl).map((seg) => (
        <div
          key={seg.id}
          role="button"
          tabIndex={0}
          aria-pressed={selected === seg.id}
          aria-label={`구간 ${formatShort(seg.sourceStartMs)}부터 ${formatShort(seg.sourceEndMs)}까지, ${seg.enabled ? '유지' : '삭제됨'}. 두 번 누르면 ${seg.enabled ? '삭제' : '복원'}`}
          onDoubleClick={() => toggleSegmentById(seg.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') toggleSegmentById(seg.id); }}
          className={cn(
            'absolute top-0 h-full border-x border-primary/50',
            seg.enabled ? 'bg-primary/10' : 'hatch bg-background/80',
            selected === seg.id && 'z-10 ring-2 ring-inset ring-primary',
          )}
          style={{ left: (seg.sourceStartMs / 1000) * pxPerSec, width: Math.max(1, ((seg.sourceEndMs - seg.sourceStartMs) / 1000) * pxPerSec) }}
        />
      ))}
    </div>
  );
}
