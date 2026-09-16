'use client';

// 타임라인은 20분 영상이면 수만 px 폭이 되므로 캔버스를 전체 폭으로 만들 수 없다.
// 보이는 폭만큼의 캔버스를 화면에 고정(sticky)해 두고, 스크롤·줌·데이터가 바뀔 때 rAF로만 다시 그린다(React 리렌더 없이).
import { useEffect, useRef, type RefObject } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

export interface TimelineView {
  scrollLeft: number;
  width: number;
  height: number;
  pxPerSec: number;
}

export type Subscribe = (schedule: () => void) => () => void;

export function useStickyCanvas(
  scrollRef: RefObject<HTMLDivElement>,
  draw: (ctx: CanvasRenderingContext2D, view: TimelineView) => void,
  extraSubscribe?: Subscribe,
): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const subRef = useRef(extraSubscribe);
  subRef.current = extraSubscribe;

  useEffect(() => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scroller || !canvas) return;
    let raf = 0;
    const render = () => {
      raf = 0;
      const width = scroller.clientWidth;
      const height = canvas.parentElement?.parentElement?.clientHeight ?? 40;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawRef.current(ctx, { scrollLeft: scroller.scrollLeft, width, height, pxPerSec: useTimelineStore.getState().pxPerSec });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
    scroller.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    const unTimeline = useTimelineStore.subscribe((s, p) => { if (s.pxPerSec !== p.pxPerSec || s.durationMs !== p.durationMs) schedule(); });
    const unProject = useProjectStore.subscribe((s, p) => { if (s.doc !== p.doc || s.peaks !== p.peaks || s.suggestions !== p.suggestions) schedule(); });
    const unExtra = subRef.current?.(schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', schedule);
      ro.disconnect();
      unTimeline();
      unProject();
      unExtra?.();
    };
  }, [scrollRef]);

  return canvasRef;
}
