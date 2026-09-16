'use client';

// 파형은 React 리렌더로 그리지 않는다: Canvas에 직접, rAF로만 갱신 (20분 영상에서도 끊기지 않게).
import type { RefObject } from 'react';
import { PEAKS_PER_SECOND } from '@/lib/audio/peaks';
import { removedRanges } from '@/lib/core/edl';
import { useProjectStore } from '@/store/projectStore';
import { useStickyCanvas } from './useStickyCanvas';

export function WaveformTrack({ scrollRef }: { scrollRef: RefObject<HTMLDivElement> }) {
  const canvasRef = useStickyCanvas(scrollRef, (ctx, { scrollLeft, width, height, pxPerSec }) => {
    const { peaks, suggestions, doc, analysis } = useProjectStore.getState();
    const xAt = (ms: number) => (ms / 1000) * pxPerSec - scrollLeft;
    const visible = (a: number, b: number) => b >= 0 && a <= width;

    if (!peaks) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '12px Pretendard, sans-serif';
      ctx.fillText(analysis ? `${analysis.label}…` : '소리 파형 없음', 8, height / 2 + 4);
      return;
    }

    const mid = height / 2;
    const count = peaks.length >> 1;
    ctx.fillStyle = 'rgba(167, 139, 250, 0.9)';
    for (let x = 0; x < width; x++) {
      const p0 = Math.floor(((scrollLeft + x) / pxPerSec) * PEAKS_PER_SECOND);
      if (p0 >= count) break;
      const p1 = Math.min(count, Math.max(p0 + 1, Math.floor(((scrollLeft + x + 1) / pxPerSec) * PEAKS_PER_SECOND)));
      let mn = 127;
      let mx = -128;
      // 확대 수준에 따라 한 픽셀에 들어가는 피크를 합친다 (줌 아웃 다운샘플)
      for (let p = p0; p < p1; p++) {
        if (peaks[p * 2] < mn) mn = peaks[p * 2];
        if (peaks[p * 2 + 1] > mx) mx = peaks[p * 2 + 1];
      }
      const top = mid - (mx / 128) * mid;
      const bottom = mid - (mn / 128) * mid;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }

    // 이미 잘린 구간: 어둡게
    ctx.fillStyle = 'rgba(10, 12, 18, 0.6)';
    for (const r of removedRanges(doc.edl)) {
      const a = xAt(r.startMs);
      const b = xAt(r.endMs);
      if (visible(a, b)) ctx.fillRect(a, 0, b - a, height);
    }

    // 자를 제안: 무음=빨강, 추임새=주황, 살리기로 바꾼 것=회색 테두리
    for (const s of suggestions) {
      const a = xAt(s.startMs);
      const b = xAt(s.endMs);
      if (!visible(a, b)) continue;
      if (s.decision === 'rejected') {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(a + 0.5, 1.5, Math.max(1, b - a - 1), height - 3);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = s.source === 'filler' ? 'rgba(249, 115, 22, 0.35)' : 'rgba(239, 68, 68, 0.35)';
        ctx.fillRect(a, 0, Math.max(1, b - a), height);
      }
    }
  });

  return (
    <div className="relative h-16 border-b">
      <div className="sticky left-0 h-full w-0">
        <canvas ref={canvasRef} className="absolute left-0 top-0 block" aria-label="소리 파형" role="img" />
      </div>
    </div>
  );
}
