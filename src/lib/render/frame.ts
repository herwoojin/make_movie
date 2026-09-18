// 화면 비율 변환 (PRD-v2 F-04). 미리보기와 내보내기가 같은 함수를 써야 결과가 어긋나지 않는다.
// 원본은 건드리지 않는다 — 그릴 때만 바꾼다.
import type { AspectMode, FillMode, ReframeBox } from '@/types/models';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameView {
  aspectMode: AspectMode;
  fillMode: FillMode;
  reframe: ReframeBox;
  /** 비율을 바꾸지 않았을 때 쓰는 기본 맞춤 (내보내기 프리셋의 contain/cover) */
  fallbackFit?: 'contain' | 'cover';
}

export interface Rect { dx: number; dy: number; dw: number; dh: number }

/** 블러 배경은 가장자리가 흐려지며 비므로 조금 크게 그린다 */
const BLUR_OVERSCAN = 1.12;
const BLUR_PX = 40;

export function aspectRatio(mode: AspectMode, srcW: number, srcH: number): number {
  if (mode === '16:9') return 16 / 9;
  if (mode === '9:16') return 9 / 16;
  return srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
}

/** 이 화면에서 원본을 어떻게 맞출지 — 비율을 바꿨으면 채움 방식이, 아니면 프리셋 설정이 정한다 */
export function fitModeOf(view: FrameView): 'contain' | 'cover' {
  if (view.aspectMode === 'original') return view.fallbackFit ?? 'contain';
  return view.fillMode === 'crop' ? 'cover' : 'contain';
}

/** 원본을 outW×outH 안에 놓을 위치. cover일 때는 reframe(중심점·배율)을 반영한다 */
export function fitRect(
  srcW: number, srcH: number, outW: number, outH: number, mode: 'contain' | 'cover', reframe?: ReframeBox, zoom = 1,
): Rect {
  const w = srcW > 0 ? srcW : outW;
  const h = srcH > 0 ? srcH : outH;
  const base = mode === 'cover' ? Math.max(outW / w, outH / h) : Math.min(outW / w, outH / h);
  const scale = base * Math.max(1, zoom) * Math.max(0.01, reframe && mode === 'cover' ? Math.max(1, reframe.scale) : 1);
  const dw = w * scale;
  const dh = h * scale;
  if (mode === 'contain') return { dx: (outW - dw) / 2, dy: (outH - dh) / 2, dw, dh };
  // reframe.x/y = "원본의 이 지점을 화면 가운데에 둔다" (0~1). 화면 밖이 비지 않도록 가둔다
  const cx = reframe ? Math.min(1, Math.max(0, reframe.x)) : 0.5;
  const cy = reframe ? Math.min(1, Math.max(0, reframe.y)) : 0.5;
  return {
    dx: Math.min(0, Math.max(outW - dw, outW / 2 - cx * dw)),
    dy: Math.min(0, Math.max(outH - dh, outH / 2 - cy * dh)),
    dw,
    dh,
  };
}

function hasFilter(ctx: Ctx2D): boolean {
  return typeof (ctx as { filter?: unknown }).filter === 'string';
}

/** 원본(또는 모자이크까지 그린 중간 화면)을 결과 화면에 그린다 */
export function drawSourceFrame(
  ctx: Ctx2D, img: CanvasImageSource, srcW: number, srcH: number, outW: number, outH: number, view: FrameView,
): void {
  const mode = fitModeOf(view);
  if (mode === 'cover') {
    const r = fitRect(srcW, srcH, outW, outH, 'cover', view.reframe);
    ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
    return;
  }

  const r = fitRect(srcW, srcH, outW, outH, 'contain');
  const letterboxed = r.dw < outW - 1 || r.dh < outH - 1;
  if (letterboxed && view.fillMode === 'blur' && hasFilter(ctx)) {
    const bg = fitRect(srcW, srcH, outW, outH, 'cover', undefined, BLUR_OVERSCAN);
    const c = ctx as CanvasRenderingContext2D;
    c.save();
    c.filter = `blur(${BLUR_PX}px)`;
    c.drawImage(img, bg.dx, bg.dy, bg.dw, bg.dh);
    c.restore();
  } else if (letterboxed) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
}

/** 미리보기 캔버스 크기 — 비율을 바꾸면 캔버스 모양도 바로 바뀐다 */
export function previewCanvasSize(view: Pick<FrameView, 'aspectMode'>, srcW: number, srcH: number, maxWidth: number): { width: number; height: number } {
  const ratio = aspectRatio(view.aspectMode, srcW, srcH);
  const h = Math.max(2, srcH > 0 ? srcH : 720);
  let width = h * ratio;
  let height = h;
  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }
  return { width: Math.max(2, Math.round(width)), height: Math.max(2, Math.round(height)) };
}

/**
 * 화면 위 위치(0~1)를 원본 위의 위치(0~1)로 되돌린다.
 * 비율을 바꾸면 화면 좌표와 원본 좌표가 달라지므로, 모자이크 네모를 그릴 때 이 변환이 필요하다.
 */
export function canvasToSourceNorm(
  nx: number, ny: number, srcW: number, srcH: number, outW: number, outH: number, view: FrameView,
): { x: number; y: number } {
  const r = fitRect(srcW, srcH, outW, outH, fitModeOf(view), view.reframe);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp((nx * outW - r.dx) / Math.max(1, r.dw)),
    y: clamp((ny * outH - r.dy) / Math.max(1, r.dh)),
  };
}

/** 잘라내기 화면을 끌어서 옮겼을 때의 새 reframe */
export function dragReframe(
  reframe: ReframeBox, deltaXPx: number, deltaYPx: number, srcW: number, srcH: number, outW: number, outH: number,
): ReframeBox {
  const r = fitRect(srcW, srcH, outW, outH, 'cover', reframe);
  const x = reframe.x - deltaXPx / Math.max(1, r.dw);
  const y = reframe.y - deltaYPx / Math.max(1, r.dh);
  // 화면 밖이 비지 않는 범위로 가둔다
  const halfX = outW / 2 / Math.max(1, r.dw);
  const halfY = outH / 2 / Math.max(1, r.dh);
  return {
    x: Math.min(1 - halfX, Math.max(halfX, x)),
    y: Math.min(1 - halfY, Math.max(halfY, y)),
    scale: reframe.scale,
  };
}
