import { describe, expect, it } from 'vitest';
import { dbToGain, duckGainCurve, gainAutomationPoints, DEFAULT_DUCK } from './ducking';

/** 앞 절반은 말소리(-10dB), 뒤 절반은 조용함(-60dB) */
const levels = (speaking: number, quiet: number) => Float32Array.from([
  ...Array.from({ length: speaking }, () => -10),
  ...Array.from({ length: quiet }, () => -60),
]);

describe('duckGainCurve', () => {
  it('말하는 동안 배경음이 낮아지고, 끝나면 되돌아온다', () => {
    const curve = duckGainCurve(levels(40, 60));
    expect(curve[0]).toBeLessThan(1);
    expect(curve[30]).toBeCloseTo(dbToGain(-12), 2); // 어택이 끝나면 -12dB
    expect(curve[curve.length - 1]).toBeGreaterThan(0.95); // 릴리즈 후 원래대로
  });

  it('릴리즈가 어택보다 느리다', () => {
    const curve = duckGainCurve(levels(20, 20));
    const attackDone = 1 - curve[5];
    const releaseDone = curve[25] - curve[20];
    expect(attackDone).toBeGreaterThan(releaseDone);
  });

  it('조용한 구간만 있으면 게인이 1로 유지된다', () => {
    const curve = duckGainCurve(Float32Array.from({ length: 10 }, () => -70));
    expect([...curve].every((g) => g > 0.99)).toBe(true);
  });

  it('낮출 크기를 바꾸면 바닥값이 바뀐다', () => {
    const curve = duckGainCurve(levels(60, 0), { ...DEFAULT_DUCK, reductionDb: 6 });
    expect(curve[50]).toBeCloseTo(dbToGain(-6), 2);
  });
});

describe('gainAutomationPoints', () => {
  it('값이 거의 그대로인 구간은 건너뛴다', () => {
    const curve = Float32Array.from([1, 1, 1, 0.5, 0.5, 0.5]);
    const points = gainAutomationPoints(curve, 20);
    expect(points.map((p) => p.value)).toEqual([1, 0.5, 0.5]);
    expect(points[0].timeSec).toBe(0);
    expect(points[1].timeSec).toBeCloseTo(0.06, 5);
  });
});
