// 모자이크 렌더 — 미리보기·내보내기·사진 일괄 처리가 모두 이 함수를 쓴다.
// 이미 프레임이 그려진 캔버스 위에서, 해당 영역의 픽셀을 읽어 가공한 뒤 다시 그린다.
import type { MosaicKeyframe, MosaicTrack } from '@/types/models';
import { boxAt, scaleBox, type Box } from './tracker';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface MosaicStyle {
  mode: MosaicTrack['mode'];
  intensity: number;
  shape: MosaicTrack['shape'];
  emoji?: string;
}

export interface MosaicTrackDoc extends MosaicTrack {
  keyframes: MosaicKeyframe[];
}

let scratch: AnyCanvas | null = null;

function scratchCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  }
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  const ctx = scratch.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없습니다');
  return { canvas: scratch, ctx };
}

function clipShape(ctx: Ctx2D, x: number, y: number, w: number, h: number, shape: MosaicStyle['shape']): void {
  ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(x, y, w, h);
  ctx.clip();
}

/** box: 0~1 정규화 좌표 (확대 배율이 이미 적용된 값) */
export function renderMosaicRegion(ctx: Ctx2D, box: Box, style: MosaicStyle): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const x = Math.max(0, Math.floor(box.x * W));
  const y = Math.max(0, Math.floor(box.y * H));
  const w = Math.min(W - x, Math.ceil(box.w * W));
  const h = Math.min(H - y, Math.ceil(box.h * H));
  if (w < 2 || h < 2) return;
  const scale = W / 1920;
  const source = ctx.canvas as AnyCanvas;

  ctx.save();
  if (style.mode === 'emoji') {
    const size = Math.min(w, h) * 1.15;
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.emoji || '😊', x + w / 2, y + h / 2 + size * 0.05);
    ctx.restore();
    return;
  }

  clipShape(ctx, x, y, w, h, style.shape);
  if (style.mode === 'box') {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
  } else if (style.mode === 'pixelate') {
    // 1/N로 줄였다가 보간 없이 키우면 블록 모자이크가 된다
    const block = Math.max(2, Math.round(style.intensity * scale));
    const sw = Math.max(1, Math.ceil(w / block));
    const sh = Math.max(1, Math.ceil(h / block));
    const s = scratchCanvas(sw, sh);
    s.ctx.imageSmoothingEnabled = true;
    s.ctx.clearRect(0, 0, sw, sh);
    s.ctx.drawImage(source, x, y, w, h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, 0, 0, sw, sh, x, y, w, h);
  } else {
    const r = Math.max(2, style.intensity * scale);
    const m = Math.ceil(r * 2);
    const sx = Math.max(0, x - m);
    const sy = Math.max(0, y - m);
    const sw = Math.min(W, x + w + m) - sx;
    const sh = Math.min(H, y + h + m) - sy;
    const s = scratchCanvas(sw, sh);
    s.ctx.clearRect(0, 0, sw, sh);
    s.ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const canFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
    if (canFilter) {
      ctx.filter = `blur(${r}px)`;
      ctx.drawImage(s.canvas, 0, 0, sw, sh, sx, sy, sw, sh);
      ctx.filter = 'none';
    } else {
      // ctx.filter 미지원(구형 Safari): 크게 줄였다가 부드럽게 키워 흐림 효과를 흉내 낸다
      const f = Math.max(2, Math.round(r));
      const tw = Math.max(1, Math.ceil(sw / f));
      const th = Math.max(1, Math.ceil(sh / f));
      s.ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s.canvas, 0, 0, tw, th, sx, sy, sw, sh);
    }
  }
  ctx.restore();
}

/** 원본 시각 sourceMs에 켜져 있는 모든 인물·수동 박스를 그린다. holdMs: 검출 샘플 간격(첫/마지막 검출 앞뒤 노출 방지) */
export function renderMosaicFrame(ctx: Ctx2D, tracks: readonly MosaicTrackDoc[], sourceMs: number, holdMs: number): void {
  for (const track of tracks) {
    if (!track.enabled || track.keyframes.length === 0) continue;
    let box: Box | null;
    if (track.createdBy === 'manual') {
      if (sourceMs < track.startMs || sourceMs > track.endMs) continue;
      box = track.keyframes.length === 1 ? track.keyframes[0] : boxAt(track.keyframes, sourceMs, track.endMs - track.startMs);
    } else {
      box = boxAt(track.keyframes, sourceMs, holdMs);
    }
    if (!box) continue;
    renderMosaicRegion(ctx, scaleBox(box, track.scale), track);
  }
}
