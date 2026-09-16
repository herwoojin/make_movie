'use client';

import type { RefObject } from 'react';
import { formatShort } from '@/lib/core/timecode';
import { useStickyCanvas } from './useStickyCanvas';

const STEPS_SEC = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function Ruler({ scrollRef }: { scrollRef: RefObject<HTMLDivElement> }) {
  const canvasRef = useStickyCanvas(scrollRef, (ctx, { scrollLeft, width, height, pxPerSec }) => {
    const step = STEPS_SEC.find((s) => s * pxPerSec >= 90) ?? 600;
    const first = Math.floor(scrollLeft / pxPerSec / step) * step;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px Pretendard, sans-serif';
    ctx.lineWidth = 1;
    for (let t = first; t * pxPerSec - scrollLeft < width; t += step) {
      const x = Math.round(t * pxPerSec - scrollLeft) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, height - 8);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(formatShort(t * 1000).replace(/\.0$/, ''), x + 3, height - 10);
      const minor = (step * pxPerSec) / 5;
      for (let m = 1; m < 5; m++) {
        const mx = Math.round(x + minor * m) + 0.5;
        ctx.beginPath();
        ctx.moveTo(mx, height - 3);
        ctx.lineTo(mx, height);
        ctx.stroke();
      }
    }
  });

  return (
    <div className="relative h-6 border-b">
      <div className="sticky left-0 h-full w-0">
        <canvas ref={canvasRef} className="absolute left-0 top-0 block" />
      </div>
    </div>
  );
}
