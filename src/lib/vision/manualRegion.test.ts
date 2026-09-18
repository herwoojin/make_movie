import { describe, expect, it } from 'vitest';
import type { MosaicKeyframe } from '@/types/models';
import { canvasToSourceNorm, sourceToCanvasBox, type FrameView } from '@/lib/render/frame';
import {
  clampBox, dragBox, hasKeyframeNear, manualBoxAt, MIN_REGION, placeRegion, rangeFor, removeKeyframeNear,
} from './manualRegion';

const kf = (id: string, timeMs: number, x: number, y = 0.1, w = 0.2, h = 0.1): MosaicKeyframe => ({
  id, trackId: 't', timeMs, x, y, w, h, score: 1, interpolated: false,
});

describe('rangeFor', () => {
  it('영상 전체 / 지금부터 끝까지 / 지금부터 5초', () => {
    expect(rangeFor('all', 3000, 60_000)).toEqual({ startMs: 0, endMs: 60_000 });
    expect(rangeFor('to-end', 3000, 60_000)).toEqual({ startMs: 3000, endMs: 60_000 });
    expect(rangeFor('five-sec', 3000, 60_000)).toEqual({ startMs: 3000, endMs: 8000 });
  });
  it('영상 끝을 넘지 않는다', () => {
    expect(rangeFor('five-sec', 58_000, 60_000)).toEqual({ startMs: 58_000, endMs: 60_000 });
    expect(rangeFor('to-end', 99_000, 60_000).startMs).toBeLessThan(60_000);
  });
});

describe('clampBox', () => {
  it('화면 밖으로 나가지 않고 최소 크기를 지킨다', () => {
    expect(clampBox({ x: 0.95, y: -0.1, w: 0.2, h: 0.1 })).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.1 });
    const tiny = clampBox({ x: 0.5, y: 0.5, w: 0, h: 0.001 });
    expect(tiny.w).toBe(MIN_REGION);
    expect(tiny.h).toBe(MIN_REGION);
  });
});

describe('manualBoxAt', () => {
  const track = { startMs: 1000, endMs: 5000 };
  it('구간 밖이면 가리지 않는다', () => {
    expect(manualBoxAt(track, [kf('a', 1000, 0.1)], 500)).toBeNull();
    expect(manualBoxAt(track, [kf('a', 1000, 0.1)], 5001)).toBeNull();
  });
  it('고정 영역은 구간 내내 같은 자리', () => {
    expect(manualBoxAt(track, [kf('a', 1000, 0.1)], 4999)?.x).toBe(0.1);
  });
  it('움직이는 영역은 키프레임 사이를 잇고, 앞뒤는 그 자리를 유지한다', () => {
    const frames = [kf('a', 2000, 0.1), kf('b', 4000, 0.5)];
    expect(manualBoxAt(track, frames, 3000)?.x).toBeCloseTo(0.3, 5);
    expect(manualBoxAt(track, frames, 1200)?.x).toBe(0.1);
    expect(manualBoxAt(track, frames, 4800)?.x).toBe(0.5);
  });
});

describe('placeRegion', () => {
  let n = 0;
  const id = () => `new${++n}`;

  it('고정 영역은 하나의 자리만 남긴다', () => {
    const out = placeRegion([kf('a', 1000, 0.1), kf('b', 3000, 0.4)], 't', 2000, { x: 0.6, y: 0.2, w: 0.1, h: 0.1 }, 'static', 40, id);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', x: 0.6, y: 0.2 });
  });

  it('움직이는 영역은 지금 시각에 자리를 하나 더 찍는다', () => {
    const out = placeRegion([kf('a', 1000, 0.1)], 't', 3000, { x: 0.5, y: 0.1, w: 0.2, h: 0.1 }, 'moving', 40, id);
    expect(out.map((k) => [k.timeMs, k.x])).toEqual([[1000, 0.1], [3000, 0.5]]);
  });

  it('가까운 자리가 있으면 새로 찍지 않고 그걸 고친다', () => {
    const out = placeRegion([kf('a', 1000, 0.1), kf('b', 3000, 0.5)], 't', 3020, { x: 0.7, y: 0.1, w: 0.2, h: 0.1 }, 'moving', 40, id);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ id: 'b', x: 0.7, timeMs: 3000 });
  });

  it('시간 순서를 지킨다', () => {
    const out = placeRegion([kf('a', 1000, 0.1), kf('b', 5000, 0.5)], 't', 3000, { x: 0.3, y: 0.1, w: 0.2, h: 0.1 }, 'moving', 40, id);
    expect(out.map((k) => k.timeMs)).toEqual([1000, 3000, 5000]);
  });
});

describe('removeKeyframeNear', () => {
  it('지금 시각의 자리만 지우고, 마지막 하나는 남긴다', () => {
    const frames = [kf('a', 1000, 0.1), kf('b', 3000, 0.5)];
    expect(removeKeyframeNear(frames, 3010).map((k) => k.id)).toEqual(['a']);
    expect(removeKeyframeNear([kf('a', 1000, 0.1)], 1000)).toHaveLength(1);
    expect(hasKeyframeNear(frames, 2990)).toBe(true);
    expect(hasKeyframeNear(frames, 2000)).toBe(false);
  });
});

describe('dragBox', () => {
  const start = { x: 0.2, y: 0.2, w: 0.2, h: 0.2 };
  it('가운데를 끌면 이동', () => {
    expect(dragBox(start, 'move', 0.1, -0.05)).toEqual({ x: 0.30000000000000004, y: 0.15000000000000002, w: 0.2, h: 0.2 });
  });
  it('모서리를 끌면 크기 조절 (반대쪽 모서리는 그대로)', () => {
    const se = dragBox(start, 'se', 0.1, 0.1);
    expect(se.x).toBe(0.2);
    expect(se.w).toBeCloseTo(0.3, 5);
    const nw = dragBox(start, 'nw', 0.05, 0.05);
    expect(nw.x).toBeCloseTo(0.25, 5);
    expect(nw.x + nw.w).toBeCloseTo(0.4, 5);
  });
  it('반대쪽을 넘어가도 뒤집히지 않고 최소 크기에서 멈춘다', () => {
    const out = dragBox(start, 'se', -0.5, -0.5);
    expect(out.w).toBe(MIN_REGION);
    expect(out.h).toBe(MIN_REGION);
    expect(out.x).toBe(0.2);
  });
});

describe('sourceToCanvasBox', () => {
  const view = (p: Partial<FrameView> = {}): FrameView => ({ aspectMode: 'original', fillMode: 'blur', reframe: { x: 0.5, y: 0.5, scale: 1 }, ...p });

  it('비율을 안 바꾸면 그대로', () => {
    const b = sourceToCanvasBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 1920, 1080, 1280, 720, view());
    expect(b.x).toBeCloseTo(0.1, 5);
    expect(b.h).toBeCloseTo(0.4, 5);
  });

  it('세로 화면(여백)에서 화면 위치 ↔ 원본 위치가 서로 되돌아간다', () => {
    const v = view({ aspectMode: '9:16', fillMode: 'solid' });
    const onCanvas = sourceToCanvasBox({ x: 0.25, y: 0.5, w: 0.1, h: 0.1 }, 1920, 1080, 608, 1080, v);
    const back = canvasToSourceNorm(onCanvas.x, onCanvas.y, 1920, 1080, 608, 1080, v);
    expect(back.x).toBeCloseTo(0.25, 5);
    expect(back.y).toBeCloseTo(0.5, 5);
  });
});
