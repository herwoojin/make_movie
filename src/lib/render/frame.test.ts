import { describe, expect, it } from 'vitest';
import type { FrameView } from './frame';
import { aspectRatio, dragReframe, fitModeOf, fitRect, previewCanvasSize } from './frame';

const view = (p: Partial<FrameView> = {}): FrameView => ({
  aspectMode: 'original', fillMode: 'blur', reframe: { x: 0.5, y: 0.5, scale: 1 }, ...p,
});

describe('aspectRatio', () => {
  it('원본은 원본 비율, 나머지는 고정 비율', () => {
    expect(aspectRatio('original', 1920, 1080)).toBeCloseTo(16 / 9, 5);
    expect(aspectRatio('16:9', 1080, 1920)).toBeCloseTo(16 / 9, 5);
    expect(aspectRatio('9:16', 1920, 1080)).toBeCloseTo(9 / 16, 5);
    expect(aspectRatio('original', 0, 0)).toBeCloseTo(16 / 9, 5);
  });
});

describe('fitModeOf', () => {
  it('비율을 바꾸지 않으면 프리셋 설정을 따른다', () => {
    expect(fitModeOf(view())).toBe('contain');
    expect(fitModeOf(view({ fallbackFit: 'cover' }))).toBe('cover');
  });
  it('비율을 바꾸면 잘라내기만 cover', () => {
    expect(fitModeOf(view({ aspectMode: '9:16', fillMode: 'crop', fallbackFit: 'cover' }))).toBe('cover');
    expect(fitModeOf(view({ aspectMode: '9:16', fillMode: 'blur', fallbackFit: 'cover' }))).toBe('contain');
  });
});

describe('fitRect', () => {
  it('세로 화면에 가로 영상을 contain — 위아래에 여백', () => {
    const r = fitRect(1920, 1080, 1080, 1920, 'contain');
    expect(r).toEqual({ dx: 0, dy: (1920 - 607.5) / 2, dw: 1080, dh: 607.5 });
  });

  it('cover는 화면을 가득 채우고 가운데를 보여 준다', () => {
    const r = fitRect(1920, 1080, 1080, 1920, 'cover', { x: 0.5, y: 0.5, scale: 1 });
    expect(r.dh).toBe(1920);
    expect(r.dw).toBeCloseTo(3413.33, 1);
    expect(r.dx).toBeCloseTo((1080 - 3413.33) / 2, 1);
    expect(r.dy).toBe(0);
  });

  it('reframe으로 보여줄 영역이 움직이되 화면 밖은 비지 않는다', () => {
    const left = fitRect(1920, 1080, 1080, 1920, 'cover', { x: 0.2, y: 0.5, scale: 1 });
    const center = fitRect(1920, 1080, 1080, 1920, 'cover', { x: 0.5, y: 0.5, scale: 1 });
    expect(left.dx).toBeGreaterThan(center.dx);
    const edge = fitRect(1920, 1080, 1080, 1920, 'cover', { x: 0, y: 0.5, scale: 1 });
    expect(edge.dx).toBe(0); // 왼쪽 끝에 붙고 그 이상은 가지 않는다
    const far = fitRect(1920, 1080, 1080, 1920, 'cover', { x: 1, y: 0.5, scale: 1 });
    expect(far.dx).toBeCloseTo(1080 - far.dw, 5);
  });

  it('scale은 더 크게만 (1 미만이면 여백이 생기므로 무시)', () => {
    const big = fitRect(1920, 1080, 1920, 1080, 'cover', { x: 0.5, y: 0.5, scale: 2 });
    expect(big.dw).toBe(3840);
    const small = fitRect(1920, 1080, 1920, 1080, 'cover', { x: 0.5, y: 0.5, scale: 0.5 });
    expect(small.dw).toBe(1920);
  });
});

describe('previewCanvasSize', () => {
  it('비율에 맞춰 캔버스 모양이 바뀌고 최대 폭을 넘지 않는다', () => {
    expect(previewCanvasSize({ aspectMode: 'original' }, 1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
    expect(previewCanvasSize({ aspectMode: '9:16' }, 1920, 1080, 1280)).toEqual({ width: 608, height: 1080 });
    expect(previewCanvasSize({ aspectMode: '16:9' }, 1080, 1920, 1280)).toEqual({ width: 1280, height: 720 });
  });
});

describe('dragReframe', () => {
  it('끄는 방향으로 보여줄 영역이 따라오고, 끝에서 멈춘다', () => {
    const start = { x: 0.5, y: 0.5, scale: 1 };
    const moved = dragReframe(start, 100, 0, 1920, 1080, 1080, 1920);
    expect(moved.x).toBeLessThan(0.5);
    const far = dragReframe(start, 100_000, 0, 1920, 1080, 1080, 1920);
    // 왼쪽 끝: 화면 절반만큼은 남는다
    expect(far.x).toBeCloseTo(1080 / 2 / fitRect(1920, 1080, 1080, 1920, 'cover', start).dw, 5);
    expect(far.scale).toBe(1);
  });
});
