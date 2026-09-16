import { describe, expect, it } from 'vitest';
import { createOutputMapper } from './outputMapper';
import { fitLayout } from './webcodecs/fitLayout';

describe('createOutputMapper', () => {
  const m = createOutputMapper([{ startMs: 1000, endMs: 2000 }, { startMs: 3000, endMs: 3500 }, { startMs: 5000, endMs: 6000 }]);
  it('누적 길이', () => {
    expect(m.totalMs).toBe(2500);
  });
  it('구간 안은 누적 오프셋 + 상대 위치, 구간 밖은 null', () => {
    expect(m.map(1000)).toBe(0);
    expect(m.map(1999.5)).toBe(999.5);
    expect(m.map(3200)).toBe(1200);
    expect(m.map(5999)).toBe(2499);
    expect(m.map(500)).toBeNull();
    expect(m.map(2500)).toBeNull();
    expect(m.map(7000)).toBeNull();
  });
  it('끝 경계는 제외 [시작, 끝)', () => {
    expect(m.map(2000)).toBeNull();
    expect(m.map(3500)).toBeNull();
  });
  it('빈 구간', () => {
    const empty = createOutputMapper([]);
    expect(empty.totalMs).toBe(0);
    expect(empty.map(0)).toBeNull();
  });
});

describe('fitLayout', () => {
  it('contain: 레터박스', () => {
    expect(fitLayout(1920, 1080, 1080, 1080, 'contain')).toEqual({ sw: 1080, sh: 608, dx: 0, dy: 236 });
  });
  it('cover: 가운데 잘라내기', () => {
    expect(fitLayout(1920, 1080, 1080, 1920, 'cover')).toEqual({ sw: 3413, sh: 1920, dx: -1166, dy: 0 });
  });
  it('같은 비율이면 그대로, 원본 크기를 모르면 출력 크기로', () => {
    expect(fitLayout(1280, 720, 1920, 1080, 'contain')).toEqual({ sw: 1920, sh: 1080, dx: 0, dy: 0 });
    expect(fitLayout(0, 0, 640, 360, 'contain')).toEqual({ sw: 640, sh: 360, dx: 0, dy: 0 });
  });
});
