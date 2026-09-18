'use client';

// 선택한 "직접 가린 영역"을 미리보기 위에서 끌어 옮기고, 모서리로 크기를 바꾼다.
// 좌표는 원본 기준(0~1)으로 저장하고, 화면 비율이 바뀌어도 제자리에 보이도록 변환해서 그린다.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { placeManualRegion } from '@/lib/editor/actions';
import { fitModeOf, fitRect, previewCanvasSize, sourceToCanvasBox } from '@/lib/render/frame';
import { dragBox, manualBoxAt, type DragHandle } from '@/lib/vision/manualRegion';
import type { Box } from '@/lib/vision/tracker';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';

interface Drag { handle: DragHandle; x: number; y: number; start: Box; box: Box }

const HANDLES: { id: Exclude<DragHandle, 'move'>; className: string; label: string }[] = [
  { id: 'nw', className: '-left-1.5 -top-1.5 cursor-nwse-resize', label: '왼쪽 위 모서리' },
  { id: 'ne', className: '-right-1.5 -top-1.5 cursor-nesw-resize', label: '오른쪽 위 모서리' },
  { id: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize', label: '왼쪽 아래 모서리' },
  { id: 'se', className: '-bottom-1.5 -right-1.5 cursor-nwse-resize', label: '오른쪽 아래 모서리' },
];

export function RegionEditOverlay() {
  const panel = useUiStore((s) => s.panel);
  const drawing = useUiStore((s) => s.drawMosaic);
  const selectedId = useTimelineStore((s) => s.selectedTrackId);
  const currentMs = useTimelineStore((s) => s.currentMs);
  const track = useProjectStore((s) => s.doc.tracks.find((t) => t.id === selectedId && t.createdBy === 'manual'));
  const view = useProjectStore((s) => s.doc.view);
  const srcW = useProjectStore((s) => s.asset?.width || 1280);
  const srcH = useProjectStore((s) => s.asset?.height || 720);
  const [drag, setDrag] = useState<Drag | null>(null);
  // 핸들에서 시작한 포인터 이벤트는 부모 네모로도 전달되므로, 끝내기는 이 ref로 한 번만 처리한다
  const dragRef = useRef<Drag | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  if (panel !== 'mosaic' || drawing || !track) return null;
  const at = manualBoxAt(track, track.keyframes, currentMs);
  if (!at) return null;

  const source = drag?.box ?? at;
  const { width: outW, height: outH } = previewCanvasSize(view, srcW, srcH, 1280);
  const onScreen = sourceToCanvasBox(source, srcW, srcH, outW, outH, view);
  // 화면에서 끈 거리를 원본 좌표로 바꾸는 비율
  const rect = fitRect(srcW, srcH, outW, outH, fitModeOf(view), view.reframe);

  const begin = (handle: DragHandle) => (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = { handle, x: e.clientX, y: e.clientY, start: at, box: at };
    dragRef.current = next;
    setDrag(next);
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    const host = hostRef.current?.parentElement;
    if (!current || !host) return;
    const bounds = host.getBoundingClientRect();
    const dx = ((e.clientX - current.x) / bounds.width) * (outW / rect.dw);
    const dy = ((e.clientY - current.y) / bounds.height) * (outH / rect.dh);
    const next = { ...current, box: dragBox(current.start, current.handle, dx, dy) };
    dragRef.current = next;
    setDrag(next);
  };

  const end = () => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    const { box, start } = current;
    const moved = box.x !== start.x || box.y !== start.y || box.w !== start.w || box.h !== start.h;
    // 되돌리기 한 번에 한 동작이 되도록 놓을 때 한 번만 기록한다
    if (moved) placeManualRegion(track.id, box);
    setDrag(null);
  };

  const moving = (track.motion ?? 'static') === 'moving';

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded">
      <div
        role="group"
        aria-label={`${track.personLabel} 위치 (끌어서 옮기기)`}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'pointer-events-auto absolute cursor-move border-2 border-dashed',
          track.enabled ? 'border-amber-300 bg-amber-300/10' : 'border-emerald-400 bg-emerald-400/10',
        )}
        style={{
          left: `${onScreen.x * 100}%`,
          top: `${onScreen.y * 100}%`,
          width: `${onScreen.w * 100}%`,
          height: `${onScreen.h * 100}%`,
        }}
      >
        {/* 화면 맨 위에 붙은 네모는 이름표를 아래에 달아 잘리지 않게 한다 */}
        <span className={cn(
          'pointer-events-none absolute left-0 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-white',
          onScreen.y < 0.08 ? 'top-full mt-1' : '-top-6',
        )}>
          {track.personLabel} · {moving ? '이 시점 위치 기록' : '끌어서 옮기기'}
        </span>
        {HANDLES.map((h) => (
          <span
            key={h.id}
            role="button"
            tabIndex={-1}
            aria-label={`${track.personLabel} ${h.label} 크기 조절`}
            onPointerDown={begin(h.id)}
            className={cn('pointer-events-auto absolute h-3 w-3 rounded-sm border border-black bg-amber-300', h.className)}
          />
        ))}
      </div>
    </div>
  );
}
