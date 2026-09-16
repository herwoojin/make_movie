import { describe, expect, it } from 'vitest';
import { normalizeFps } from './demux';

describe('normalizeFps', () => {
  it('정수 근처는 정수로 (mp4-muxer는 정수 fps만 받음)', () => {
    expect(normalizeFps(29.92)).toBe(30);
    expect(normalizeFps(59.95)).toBe(60);
    expect(normalizeFps(24)).toBe(24);
  });
  it('그 외는 소수 둘째 자리', () => {
    expect(normalizeFps(12.5)).toBe(12.5);
    expect(normalizeFps(23.456)).toBe(23.46);
  });
  it('잘못된 값은 30', () => {
    expect(normalizeFps(0)).toBe(30);
    expect(normalizeFps(Number.NaN)).toBe(30);
    expect(normalizeFps(Infinity)).toBe(30);
  });
});
