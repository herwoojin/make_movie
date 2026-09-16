'use client';

import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { segmentAt } from '@/lib/core/edl';
import { seekTo } from '@/lib/editor/actions';
import { useProjectStore } from '@/store/projectStore';
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, useTimelineStore } from '@/store/timelineStore';
import { MosaicTrack } from './MosaicTrack';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { SubtitleTrack } from './SubtitleTrack';
import { VideoTrack } from './VideoTrack';
import { WaveformTrack } from './WaveformTrack';

const PAD = 80;
const LABELS: [string, number][] = [['시간', 24], ['영상', 48], ['소리', 64], ['자막', 32], ['모자이크', 40]];

// 줌 슬라이더는 로그 스케일이 자연스럽다 (1px/초 ~ 500px/초)
const toSlider = (px: number) => Math.log(px);
const fromSlider = (v: number) => Math.exp(v);

export function TimelineRoot() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const duration = useTimelineStore((s) => s.durationMs);
  const pxPerSec = useTimelineStore((s) => s.pxPerSec);
  const contentWidth = Math.ceil((duration / 1000) * pxPerSec) + PAD;

  const fit = () => {
    const el = scrollRef.current;
    if (el) useTimelineStore.getState().fitToWidth(el.clientWidth - PAD);
  };
  useEffect(fit, [duration]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const { pxPerSec: px, setZoom } = useTimelineStore.getState();
        const anchorMs = ((el.scrollLeft + x) / px) * 1000;
        setZoom(px * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        requestAnimationFrame(() => { el.scrollLeft = (anchorMs / 1000) * useTimelineStore.getState().pxPerSec - x; });
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // 재생 중 재생헤드가 화면 밖으로 나가면 따라간다
    const unfollow = useTimelineStore.subscribe((s) => {
      if (!s.playing || dragging.current) return;
      const x = (s.currentMs / 1000) * s.pxPerSec;
      if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 40;
    });
    return () => { el.removeEventListener('wheel', onWheel); unfollow(); };
  }, []);

  const msFromEvent = (e: PointerEvent) => {
    const el = scrollRef.current!;
    const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft;
    return (x / useTimelineStore.getState().pxPerSec) * 1000;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-drag]')) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = msFromEvent(e);
    seekTo(ms);
    if ((e.target as HTMLElement).closest('[data-row="video"]')) {
      useTimelineStore.getState().selectSegment(segmentAt(useProjectStore.getState().doc.edl, ms)?.id ?? null);
    }
  };

  return (
    <div className="flex h-[252px] shrink-0 flex-col border-t bg-card/60">
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs text-muted-foreground">
        <span>타임라인</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="축소" onClick={() => useTimelineStore.getState().zoomBy(1 / 1.5)}><ZoomOut /></Button>
        <Slider className="w-32" aria-label="타임라인 확대 정도" min={toSlider(MIN_PX_PER_SEC)} max={toSlider(MAX_PX_PER_SEC)} step={0.01}
          value={[toSlider(pxPerSec)]} onValueChange={([v]) => useTimelineStore.getState().setZoom(fromSlider(v))} />
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="확대" onClick={() => useTimelineStore.getState().zoomBy(1.5)}><ZoomIn /></Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={fit}><Maximize2 /> 전체 보기</Button>
        <span className="ml-auto hidden sm:inline">Ctrl+휠: 확대/축소 · 드래그: 위치 이동 · 빨간 영역: 자를 제안 · 빗금: 잘린 구간</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-16 shrink-0 border-r text-[11px] text-muted-foreground" aria-hidden>
          {LABELS.map(([label, h]) => <div key={label} className="flex items-center border-b px-2" style={{ height: h }}>{label}</div>)}
        </div>
        <div ref={scrollRef} className="scrollbar-thin relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={(e) => { if (dragging.current) seekTo(msFromEvent(e)); }}
          onPointerUp={() => { dragging.current = false; }}
          role="group" aria-label="타임라인">
          <div className="relative select-none" style={{ width: contentWidth }}>
            <Ruler scrollRef={scrollRef} />
            <VideoTrack scrollRef={scrollRef} />
            <WaveformTrack scrollRef={scrollRef} />
            <SubtitleTrack />
            <MosaicTrack />
            <Playhead />
          </div>
        </div>
      </div>
    </div>
  );
}
