// 미리보기 전용 보조 표시(내보내기에는 들어가지 않음): 인물 테두리, 잘린 구간 표시.
import type { MosaicTrackDoc } from '@/types/editor';
import { trackBoxAt } from '@/lib/vision/mosaicRender';
import { scaleBox } from '@/lib/vision/tracker';

export function drawTrackOutlines(
  ctx: CanvasRenderingContext2D, tracks: readonly MosaicTrackDoc[], sourceMs: number, holdMs: number, selectedId: string | null,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.font = `600 ${Math.max(12, W / 70)}px Pretendard, sans-serif`;
  for (const t of tracks) {
    const box = trackBoxAt(t, sourceMs, holdMs);
    if (!box) continue;
    const b = scaleBox(box, t.scale);
    const selected = t.id === selectedId;
    ctx.lineWidth = selected ? 4 : 2;
    ctx.setLineDash(t.enabled ? [] : [8, 6]);
    ctx.strokeStyle = t.enabled ? '#ef4444' : '#22c55e';
    ctx.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    const label = t.enabled ? t.personLabel : `${t.personLabel} (가리지 않음)`;
    ctx.fillStyle = t.enabled ? '#ef4444' : '#16a34a';
    const tw = ctx.measureText(label).width + 10;
    ctx.fillRect(b.x * W, Math.max(0, b.y * H - 22), tw, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, b.x * W + 5, Math.max(15, b.y * H - 7));
  }
  ctx.restore();
}

/** 재생헤드가 잘린 구간에 있을 때: 이 장면은 결과물에 안 들어간다는 것을 한눈에 */
export function drawCutTint(ctx: CanvasRenderingContext2D): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(15, 17, 23, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = `700 ${Math.max(16, W / 40)}px Pretendard, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('✂ 잘려 나갈 구간', W / 2, H / 2);
  ctx.restore();
}
