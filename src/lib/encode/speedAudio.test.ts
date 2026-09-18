import { describe, expect, it } from 'vitest';
import { hasSpeedChange, speedSpansToSamples, VariableSpeedResampler } from './speedAudio';

const ramp = (n: number, from = 0) => Float32Array.from({ length: n }, (_, i) => from + i);

describe('speedSpansToSamples', () => {
  it('ms 구간을 샘플 번호로 바꾸고 빈 구간은 버린다', () => {
    expect(speedSpansToSamples([{ startMs: 0, endMs: 1000, speed: 2 }, { startMs: 5, endMs: 5, speed: 3 }], 48_000))
      .toEqual([{ start: 0, end: 48_000, speed: 2 }]);
  });
});

describe('hasSpeedChange', () => {
  it('전체 배속이나 구간 배속이 1이 아니면 true', () => {
    expect(hasSpeedChange([], 1)).toBe(false);
    expect(hasSpeedChange([], 1.5)).toBe(true);
    expect(hasSpeedChange([{ startMs: 0, endMs: 10, speed: 2 }], 1)).toBe(true);
    expect(hasSpeedChange([{ startMs: 0, endMs: 0, speed: 2 }], 1)).toBe(false);
  });
});

describe('VariableSpeedResampler', () => {
  it('2배속이면 샘플 수가 절반이 된다', () => {
    const r = new VariableSpeedResampler([], 1, 2);
    const out = r.process([ramp(100)]);
    expect(out[0].length).toBe(50);
    expect(Array.from(out[0].slice(0, 4))).toEqual([0, 2, 4, 6]);
  });

  it('조각이 나뉘어 들어와도 이어서 계산한다', () => {
    const whole = new VariableSpeedResampler([], 1, 2).process([ramp(200)]);
    const split = new VariableSpeedResampler([], 1, 2);
    const a = split.process([ramp(100)]);
    const b = split.process([ramp(100, 100)]);
    const joined = Float32Array.from([...a[0], ...b[0]]);
    expect(joined.length).toBeGreaterThanOrEqual(whole[0].length - 1);
    expect(Array.from(joined.slice(0, 6))).toEqual(Array.from(whole[0].slice(0, 6)));
  });

  it('구간마다 배속이 다르면 그 구간만 빨라진다', () => {
    // 앞 100샘플은 2배속, 나머지는 1배속
    const r = new VariableSpeedResampler([{ start: 0, end: 100, speed: 2 }], 1, 1);
    const out = r.process([ramp(200)]);
    expect(out[0].length).toBe(50 + 99);
    expect(out[0][49]).toBe(98);
    expect(out[0][50]).toBe(100);
  });

  it('배속 1이면 값이 그대로 흐른다', () => {
    const r = new VariableSpeedResampler([], 2, 1);
    const out = r.process([ramp(10), ramp(10, 100)]);
    expect(Array.from(out[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(out[1])).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108]);
  });

  it('빈 조각은 빈 결과', () => {
    expect(new VariableSpeedResampler([], 2, 1).process([new Float32Array(0), new Float32Array(0)])[0].length).toBe(0);
  });
});
