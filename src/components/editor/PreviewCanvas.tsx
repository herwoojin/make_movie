'use client';

// 미리보기: <video>를 재생 시계로 쓰고, 매 프레임 캔버스에 "원본 → 모자이크 → 자막" 순서로 합성한다.
// 내보내기와 똑같은 renderMosaicFrame / renderSubtitleToCanvas를 써서 미리보기와 결과가 어긋나지 않게 한다.
import { useEffect, useRef, useState } from 'react';
import { isSourceKept, nextKeptSourceMs, sourceToOutput } from '@/lib/core/edl';
import { player } from '@/lib/editor/player';
import { ensureSubtitleFonts } from '@/lib/fonts';
import { clipAtSourceMs, clipCaption } from '@/lib/subtitle/clipCues';
import { renderSubtitleToCanvas } from '@/lib/subtitle/render';
import { renderMosaicFrame } from '@/lib/vision/mosaicRender';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { ManualBoxOverlay } from './ManualBoxOverlay';
import { drawCutTint, drawTrackOutlines } from './previewOverlays';

const MAX_PREVIEW_WIDTH = 1280;
const SAMPLE_CUE = { text: '자막 미리보기 예시입니다. 스타일을 바꿔 보세요' };

export function PreviewCanvas() {
  const sourceUrl = useProjectStore((s) => s.sourceUrl);
  const srcW = useProjectStore((s) => s.asset?.width || 1280);
  const srcH = useProjectStore((s) => s.asset?.height || 720);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const scale = Math.min(1, MAX_PREVIEW_WIDTH / srcW);
  const W = Math.max(2, Math.round(srcW * scale));
  const H = Math.max(2, Math.round(srcH * scale));

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

      // 재생 중에는 잘린 구간을 건너뛰어 "결과물"을 미리 보여준다 (구간 미리듣기 중에는 예외)
      if (!video.paused && !player.checkRangeEnd(t) && player.skipsCuts && !isSourceKept(t, doc.edl)) {
        const next = nextKeptSourceMs(t, doc.edl);
        if (next === null) video.pause();
        else if (next > t) video.currentTime = next / 1000;
      }
      tl.setCurrentMs(t);
      if (tl.playing === video.paused) tl.setPlaying(!video.paused);
      if (!ctx || video.readyState < 2) return;

      ctx.drawImage(video, 0, 0, W, H);
      if (ui.previewMosaic) renderMosaicFrame(ctx, doc.tracks, t, mosaicHoldMs);
      if (ui.panel === 'mosaic') drawTrackOutlines(ctx, doc.tracks, t, mosaicHoldMs, tl.selectedTrackId);
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
  }, [sourceUrl, W, H]);

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center">
      <video ref={videoRef} src={sourceUrl ?? undefined} playsInline preload="auto" aria-hidden tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <canvas ref={canvasRef} width={W} height={H} onClick={() => player.toggle()}
          className="h-full w-full cursor-pointer rounded bg-black" role="img" aria-label="편집 결과 미리보기 (누르면 재생/정지)" />
        <ManualBoxOverlay />
        {!sourceUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">원본 영상을 불러오지 못했습니다</div>
        )}
      </div>
    </div>
  );
}
