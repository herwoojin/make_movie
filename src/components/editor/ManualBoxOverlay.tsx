'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { addManualMosaic } from '@/lib/editor/actions';
import { canvasToSourceNorm, previewCanvasSize } from '@/lib/render/frame';
import type { Box } from '@/lib/vision/tracker';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

/** 미리보기 위에 드래그해서 수동 모자이크 사각형을 그린다 (좌표는 0~1 정규화로 저장) */
export function ManualBoxOverlay() {
  const active = useUiStore((s) => s.drawMosaic);
  const [rect, setRect] = useState<Box | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  if (!active) return null;

  // 화면 좌표 → 원본 좌표. 비율을 바꿔 여백이 생겼거나 잘라낸 상태에서도 네모가 제자리에 붙는다
  const norm = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const { doc, asset } = useProjectStore.getState();
    const srcW = asset?.width || 1280;
    const srcH = asset?.height || 720;
    const { width, height } = previewCanvasSize(doc.view, srcW, srcH, 1280);
    return canvasToSourceNorm(nx, ny, srcW, srcH, width, height, doc.view);
  };

  return (
    <div
      className="absolute inset-0 cursor-crosshair rounded ring-2 ring-primary"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); origin.current = norm(e); setRect(null); }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const p = norm(e);
        const o = origin.current;
        setRect({ x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
      }}
      onPointerUp={() => {
        origin.current = null;
        if (rect && rect.w > 0.01 && rect.h > 0.01) {
          addManualMosaic(rect);
          useUiStore.getState().setDrawMosaic(false);
        }
        setRect(null);
      }}
    >
      <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/80 px-3 py-1 text-xs text-white">
        가릴 곳을 드래그해서 네모로 그리세요 (Esc: 취소)
      </p>
      {rect && (
        <div className="pointer-events-none absolute border-2 border-red-500 bg-red-500/20"
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
      )}
    </div>
  );
}
