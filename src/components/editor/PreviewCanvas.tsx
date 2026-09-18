'use client';

// 미리보기: <video>를 재생 시계로 쓰고, 매 프레임 캔버스에 "원본 → 모자이크 → 비율 변환 → 자막" 순서로 합성한다.
// 내보내기와 똑같은 drawSourceFrame / renderMosaicFrame / renderSubtitleToCanvas를 써서 결과가 어긋나지 않게 한다.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isSourceKept, nextKeptSourceMs, sourceToOutput } from '@/lib/core/edl';
import { player } from '@/lib/editor/player';
import { ensureSubtitleFonts } from '@/lib/fonts';
import { dragReframe, drawSourceFrame, previewCanvasSize } from '@/lib/render/frame';
import { clipAtSourceMs, clipCaption } from '@/lib/subtitle/clipCues';
import { renderSubtitleToCanvas } from '@/lib/subtitle/render';
import { renderMosaicFrame } from '@/lib/vision/mosaicRender';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { ManualBoxOverlay } from './ManualBoxOverlay';
import { RegionEditOverlay } from './RegionEditOverlay';
import { drawCutTint, drawTrackOutlines } from './previewOverlays';

const MAX_PREVIEW_WIDTH = 1280;
const SAMPLE_CUE = { text: '자막 미리보기 예시입니다. 스타일을 바꿔 보세요' };

export function PreviewCanvas() {
  const sourceUrl = useProjectStore((s) => s.sourceUrl);
  const srcW = useProjectStore((s) => s.asset?.width || 1280);
  const srcH = useProjectStore((s) => s.asset?.height || 720);
  const aspectMode = useProjectStore((s) => s.doc.view.aspectMode);
  const canDrag = useProjectStore((s) => s.doc.view.aspectMode !== 'original' && s.doc.view.fillMode === 'crop');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<{ canvas: HTMLCanvasElement; w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const { width: W, height: H } = useMemo(
    () => previewCanvasSize({ aspectMode }, srcW, srcH, MAX_PREVIEW_WIDTH),
    [aspectMode, srcW, srcH],
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const k = Math.min(box.clientWidth / W, box.clientHeight / H);
      setSize({ w: Math.floor(W * k), h: Math.floor(H * k) });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [W, H]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !sourceUrl) return;
    player.attach(video);
    void ensureSubtitleFonts();
    const ctx = canvas.getContext('2d');
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { doc, mosaicHoldMs } = useProjectStore.getState();
      const ui = useUiStore.getState();
      const tl = useTimelineStore.getState();
      const t = Math.round(video.currentTime * 1000);

      // 재생 중에는 잘린 구간을 건너뛰어 "결과물"을 미리 보여준다 (컷 구간 확인 중에는 예외)
      if (!video.paused && !player.checkRangeEnd(t) && player.skipsCuts && !isSourceKept(t, doc.edl)) {
        const next = nextKeptSourceMs(t, doc.edl);
        if (next === null) video.pause();
        else if (next > t) video.currentTime = next / 1000;
      }
      tl.setCurrentMs(t);
      if (tl.playing === video.paused) tl.setPlaying(!video.paused);
      if (!ctx || video.readyState < 2) return;

      // 모자이크는 원본 좌표계에서 그려야 해서 중간 화면에 먼저 그린다 (내보내기와 같은 순서)
      const sw = video.videoWidth || srcW;
      const sh = video.videoHeight || srcH;
      let stage = stageRef.current;
      if (!stage || stage.w !== sw || stage.h !== sh) {
        const el = document.createElement('canvas');
        el.width = sw;
        el.height = sh;
        stage = { canvas: el, w: sw, h: sh };
        stageRef.current = stage;
      }
      const sctx = stage.canvas.getContext('2d');
      if (!sctx) return;
      sctx.drawImage(video, 0, 0, sw, sh);
      if (ui.previewMosaic) renderMosaicFrame(sctx, doc.tracks, t, mosaicHoldMs);
      if (ui.panel === 'mosaic') drawTrackOutlines(sctx, doc.tracks, t, mosaicHoldMs, tl.selectedTrackId);

      drawSourceFrame(ctx, stage.canvas, sw, sh, W, H, doc.view);
      if (sourceToOutput(t, doc.edl) === null) drawCutTint(ctx);
      // 자막은 원본 시각으로 찾는다 — 시간 변환을 한 번 더 거치지 않아 미리보기와 결과가 어긋날 여지가 없다
      const clip = clipAtSourceMs(doc.clips, t);
      if (clip) renderSubtitleToCanvas(ctx, { text: clipCaption(clip), styleOverride: clip.styleOverride }, doc.style, W);
      else if (ui.panel === 'style') renderSubtitleToCanvas(ctx, SAMPLE_CUE, doc.style, W);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      player.detach(video);
    };
  }, [sourceUrl, W, H, srcW, srcH]);

  // 잘라내기: 화면을 끌어 보여줄 영역을 옮긴다 (F-04-2)
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDrag) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const from = dragRef.current;
    if (!from || size.w === 0) return;
    const scale = W / size.w; // 화면 픽셀 → 캔버스 픽셀
    const { doc } = useProjectStore.getState();
    const next = dragReframe(doc.view.reframe, (e.clientX - from.x) * scale, (e.clientY - from.y) * scale, srcW, srcH, W, H);
    dragRef.current = { x: e.clientX, y: e.clientY };
    useProjectStore.getState().setView({ reframe: next });
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center">
      <video ref={videoRef} src={sourceUrl ?? undefined} playsInline preload="auto" aria-hidden tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={() => { if (!canDrag) player.toggle(); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`h-full w-full rounded bg-black ${canDrag ? 'cursor-move' : 'cursor-pointer'}`}
          role="img"
          aria-label={canDrag ? '편집 결과 미리보기 (끌어서 보여줄 영역 옮기기)' : '편집 결과 미리보기 (누르면 재생/정지)'}
        />
        <RegionEditOverlay />
        <ManualBoxOverlay />
        {!sourceUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">원본 영상을 불러오지 못했습니다</div>
        )}
      </div>
    </div>
  );
}
