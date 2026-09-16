import { describe, expect, it } from 'vitest';
import { fillPercent, levelFromPercent, worstLevel } from './health';

describe('health', () => {
  it('임계값 70 / 85 / 95', () => {
    expect(levelFromPercent(69.9)).toBe('ok');
    expect(levelFromPercent(70)).toBe('warn');
    expect(levelFromPercent(85)).toBe('danger');
    expect(levelFromPercent(95)).toBe('critical');
    expect(levelFromPercent(null)).toBe('ok');
    expect(levelFromPercent(Number.NaN)).toBe('ok');
  });
  it('가장 나쁜 항목이 결정', () => {
    expect(worstLevel(['ok', 'danger', 'warn'])).toBe('danger');
    expect(worstLevel([])).toBe('ok');
  });
  it('채움률 = 100 - 최대 사용률, 값이 없으면 100', () => {
    expect(fillPercent([35, 78.1, null])).toBeCloseTo(21.9);
    expect(fillPercent([null, undefined])).toBe(100);
    expect(fillPercent([120])).toBe(0);
  });
});
