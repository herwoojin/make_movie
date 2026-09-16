// 자막 렌더 — 미리보기와 내보내기가 반드시 이 함수 하나만 쓴다 (둘이 다르면 반드시 어긋난다).
// 모든 치수는 가로 1920 기준 값을 videoWidth 비율로 환산한다.
import type { StyleValues, SubtitleCue } from '@/types/models';
import { wrapText } from './model';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const BASE_WIDTH = 1920;
export const LINE_HEIGHT = 1.25;

export function subtitleFont(style: Pick<StyleValues, 'fontWeight' | 'fontSize' | 'fontFamily'>, videoWidth: number): string {
  const px = (style.fontSize * videoWidth) / BASE_WIDTH;
  return `${style.fontWeight} ${px.toFixed(2)}px "${style.fontFamily}", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function renderSubtitleToCanvas(
  ctx: Ctx2D, cue: Pick<SubtitleCue, 'text' | 'styleOverride'>, baseStyle: StyleValues, videoWidth: number,
): void {
  const style: StyleValues = { ...baseStyle, ...cue.styleOverride };
  const lines = wrapText(cue.text, style.maxCharsPerLine, style.maxLines).filter((l) => l.length > 0);
  if (lines.length === 0) return;

  const scale = videoWidth / BASE_WIDTH;
  const canvasH = ctx.canvas.height;
  const fontPx = style.fontSize * scale;
  const lineH = fontPx * LINE_HEIGHT;
  const padX = style.bgPaddingX * scale;
  const padY = style.bgPaddingY * scale;
  const sideMargin = 40 * scale;
  const margin = style.marginBottom * scale;

  ctx.save();
  ctx.font = subtitleFont(style, videoWidth);
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.alignment;

  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths) + padX * 2;
  const blockH = lines.length * lineH + padY * 2;
  const top = style.verticalPosition === 'top' ? margin
    : style.verticalPosition === 'middle' ? (canvasH - blockH) / 2
      : canvasH - margin - blockH;
  const anchorX = style.alignment === 'left' ? sideMargin + padX
    : style.alignment === 'right' ? videoWidth - sideMargin - padX
      : videoWidth / 2;

  if (style.bgOpacity > 0) {
    const left = style.alignment === 'left' ? anchorX - padX
      : style.alignment === 'right' ? anchorX + padX - blockW
        : anchorX - blockW / 2;
    ctx.fillStyle = hexToRgba(style.bgColor, style.bgOpacity);
    roundRect(ctx, left, top, blockW, blockH, style.bgRadius * scale);
    ctx.fill();
  }

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  lines.forEach((line, i) => {
    const y = top + padY + lineH * (i + 0.5);
    if (style.shadowBlur > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = style.shadowBlur * scale;
      ctx.shadowOffsetY = 2 * scale;
    }
    if (style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      // 선은 글자 윤곽 중앙에 그려지므로 2배 두께로 그리고 위에 채우기를 덮는다
      ctx.lineWidth = style.outlineWidth * 2 * scale;
      ctx.strokeText(line, anchorX, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, anchorX, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}
