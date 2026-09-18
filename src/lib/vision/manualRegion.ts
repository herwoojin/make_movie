// 직접 그린 가림 영역 (얼굴 말고 이메일·전화번호·명찰·번호판 등).
// 고정 영역은 키프레임 1개, 움직이는 영역은 시점마다 키프레임을 찍고 사이를 부드럽게 잇는다.
import type { MosaicKeyframe, MosaicTrack } from '@/types/models';
import { boxAt, type Box } from './tracker';

export type RegionRange = 'all' | 'to-end' | 'five-sec';
export type RegionMotion = 'static' | 'moving';

export const MIN_REGION = 0.01;

export const RANGE_LABELS: Record<RegionRange, string> = {
  all: '영상 전체',
  'to-end': '지금부터 끝까지',
  'five-sec': '지금부터 5초',
};

/** 새 영역을 어느 구간에 걸지 */
export function rangeFor(range: RegionRange, currentMs: number, durationMs: number): { startMs: number; endMs: number } {
  const end = Math.max(1, Math.round(durationMs));
  const now = Math.max(0, Math.min(end - 1, Math.round(currentMs)));
  if (range === 'all') return { startMs: 0, endMs: end };
  if (range === 'to-end') return { startMs: now, endMs: end };
  return { startMs: now, endMs: Math.min(end, now + 5000) };
}

/** 화면 안에 머물고 너무 작아지지 않게 */
export function clampBox(box: Box): Box {
  const w = Math.min(1, Math.max(MIN_REGION, box.w));
  const h = Math.min(1, Math.max(MIN_REGION, box.h));
  return {
    x: Math.min(1 - w, Math.max(0, box.x)),
    y: Math.min(1 - h, Math.max(0, box.y)),
    w,
    h,
  };
}

/** 직접 그린 영역이 이 시각에 있는 자리. 구간 밖이면 null */
export function manualBoxAt(track: Pick<MosaicTrack, 'startMs' | 'endMs'>, keyframes: readonly MosaicKeyframe[], timeMs: number): Box | null {
  if (keyframes.length === 0 || timeMs < track.startMs || timeMs > track.endMs) return null;
  if (keyframes.length === 1) return pick(keyframes[0]);
  // 첫 키프레임 앞·마지막 뒤는 그 자리를 그대로 유지한다
  return boxAt(keyframes, timeMs, Number.POSITIVE_INFINITY);
}

function pick(b: Box): Box {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/**
 * 영역을 옮기거나 크기를 바꾼다.
 * - 고정 영역: 키프레임을 하나로 합쳐 그 자리로 옮긴다 (영상 내내 같은 곳)
 * - 움직이는 영역: 지금 시각에 키프레임을 찍는다 (가까운 게 있으면 그걸 고친다)
 */
export function placeRegion(
  keyframes: readonly MosaicKeyframe[], trackId: string, timeMs: number, box: Box, motion: RegionMotion,
  toleranceMs = 40, idGen: () => string = () => `${trackId}-k${Date.now().toString(36)}`,
): MosaicKeyframe[] {
  const b = clampBox(box);
  const base = { trackId, score: 1, interpolated: false };
  if (motion === 'static' || keyframes.length === 0) {
    const first = keyframes[0];
    return [{ ...base, id: first?.id ?? idGen(), timeMs: first?.timeMs ?? Math.round(timeMs), ...b }];
  }
  const near = keyframes.findIndex((k) => Math.abs(k.timeMs - timeMs) <= toleranceMs);
  if (near >= 0) return keyframes.map((k, i) => (i === near ? { ...k, ...b } : k));
  return [...keyframes, { ...base, id: idGen(), timeMs: Math.round(timeMs), ...b }].sort((a, c) => a.timeMs - c.timeMs);
}

/** 움직이는 영역에서 지금 시각의 위치 기록을 지운다 (마지막 하나는 남긴다) */
export function removeKeyframeNear(keyframes: readonly MosaicKeyframe[], timeMs: number, toleranceMs = 40): MosaicKeyframe[] {
  if (keyframes.length <= 1) return [...keyframes];
  const near = keyframes.findIndex((k) => Math.abs(k.timeMs - timeMs) <= toleranceMs);
  return near < 0 ? [...keyframes] : keyframes.filter((_, i) => i !== near);
}

export function hasKeyframeNear(keyframes: readonly MosaicKeyframe[], timeMs: number, toleranceMs = 40): boolean {
  return keyframes.some((k) => Math.abs(k.timeMs - timeMs) <= toleranceMs);
}

/** 끌기 결과: 이동 / 네 모서리 크기 조절 */
export type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export function dragBox(start: Box, handle: DragHandle, dx: number, dy: number): Box {
  if (handle === 'move') return clampBox({ ...start, x: start.x + dx, y: start.y + dy });
  let { x, y, w, h } = start;
  if (handle === 'nw' || handle === 'sw') { x += dx; w -= dx; }
  if (handle === 'ne' || handle === 'se') w += dx;
  if (handle === 'nw' || handle === 'ne') { y += dy; h -= dy; }
  if (handle === 'sw' || handle === 'se') h += dy;
  // 반대쪽을 넘어가면 뒤집지 않고 최소 크기에서 멈춘다
  if (w < MIN_REGION) { if (handle === 'nw' || handle === 'sw') x -= MIN_REGION - w; w = MIN_REGION; }
  if (h < MIN_REGION) { if (handle === 'nw' || handle === 'ne') y -= MIN_REGION - h; h = MIN_REGION; }
  return clampBox({ x, y, w, h });
}
