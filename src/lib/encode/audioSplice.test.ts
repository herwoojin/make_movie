import { describe, expect, it } from 'vitest';
import { AudioSplicer, concatPlanes, LinearResampler, msRangesToSamples, planarToBuffer } from './audioSplice';

/** 샘플 값 = 원본 샘플 번호 (어느 샘플이 출력에 들어갔는지 추적 가능) */
function ramp(from: number, to: number): Float32Array {
  return Float32Array.from({ length: to - from }, (_, i) => from + i);
}

function run(ranges: { start: number; end: number }[], total: number, fade: number, chunkSizes: number[]): number[] {
  const s = new AudioSplicer(ranges, 1, fade);
  const out: Float32Array[][] = [];
  let pos = 0;
  let i = 0;
  while (pos < total) {
    const size = Math.min(chunkSizes[i++ % chunkSizes.length], total - pos);
    out.push(...s.push([ramp(pos, pos + size)], pos));
    pos += size;
  }
  out.push(...s.flush());
  return Array.from(concatPlanes(out, 1)[0]);
}

describe('msRangesToSamples', () => {
  it('ms → 샘플 번호, 빈 구간 제거', () => {
    expect(msRangesToSamples([{ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 5 }], 48000)).toEqual([{ start: 0, end: 480 }]);
  });
});

describe('AudioSplicer', () => {
  it('페이드 없이: 유지 구간만 순서대로', () => {
    const out = run([{ start: 2, end: 5 }, { start: 8, end: 10 }], 12, 0, [4]);
    expect(out).toEqual([2, 3, 4, 8, 9]);
  });

  it('출력 길이 = 유지 구간 길이의 합 (크로스페이드가 있어도 싱크 보존)', () => {
    const ranges = [{ start: 10, end: 40 }, { start: 60, end: 90 }, { start: 100, end: 130 }];
    const out = run(ranges, 150, 5, [7]);
    expect(out).toHaveLength(90);
  });

  it('경계 크로스페이드: A 꼬리와 B 직전 샘플을 섞는다', () => {
    const out = run([{ start: 0, end: 10 }, { start: 20, end: 30 }], 30, 4, [30]);
    expect(out.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    // 6..9 자리 = tail(6..9)과 pre(16..19)의 가중 합
    const w = [0.125, 0.375, 0.625, 0.875];
    w.forEach((wk, k) => expect(out[6 + k]).toBeCloseTo((6 + k) * (1 - wk) + (16 + k) * wk, 5));
    expect(out.slice(10)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it('조각 크기가 달라도 결과가 같다', () => {
    const ranges = [{ start: 3, end: 50 }, { start: 70, end: 71 }, { start: 80, end: 120 }, { start: 130, end: 199 }];
    const a = run(ranges, 200, 6, [200]);
    const b = run(ranges, 200, 6, [1, 3, 7, 2]);
    const c = run(ranges, 200, 6, [13]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a).toHaveLength(47 + 1 + 40 + 69);
  });

  it('틈이 페이드보다 짧으면 크로스페이드 생략', () => {
    const out = run([{ start: 0, end: 10 }, { start: 12, end: 20 }], 20, 4, [5]);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('입력이 도중에 끝나면 꼬리를 그대로 내보낸다', () => {
    const out = run([{ start: 0, end: 10 }, { start: 20, end: 30 }], 12, 4, [12]);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('구간 밖 데이터만 오면 출력 없음, 입력에 빈 구간이 건너뛰어져도 안전', () => {
    const s = new AudioSplicer([{ start: 100, end: 200 }], 2, 4);
    expect(s.push([ramp(0, 50), ramp(0, 50)], 0)).toEqual([]);
    const skipped = new AudioSplicer([{ start: 0, end: 10 }, { start: 20, end: 30 }], 1, 4);
    const out = [...skipped.push([ramp(0, 8)], 0), ...skipped.push([ramp(40, 50)], 40), ...skipped.flush()];
    expect(Array.from(concatPlanes(out, 1)[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('LinearResampler', () => {
  it('일정한 신호는 일정하게, 길이는 비율대로', () => {
    const r = new LinearResampler(44100, 48000, 1);
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const [out] = r.process([new Float32Array(4410).fill(0.5)]);
      if (i > 0) out.forEach((v) => expect(v).toBeCloseTo(0.5, 6));
      total += out.length;
    }
    expect(Math.abs(total - 48000)).toBeLessThanOrEqual(2);
  });
  it('선형 램프 보간', () => {
    const r = new LinearResampler(2, 4, 1);
    const [out] = r.process([Float32Array.from([0, 2, 4, 6])]);
    expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 5]);
    const [next] = r.process([Float32Array.from([8, 10])]);
    expect(Array.from(next)).toEqual([6, 7, 8, 9]);
    expect(r.process([new Float32Array(0)])[0]).toHaveLength(0);
  });
});

describe('planarToBuffer', () => {
  it('채널을 이어 붙인다', () => {
    expect(Array.from(planarToBuffer([Float32Array.from([1, 2]), Float32Array.from([3, 4])]))).toEqual([1, 2, 3, 4]);
  });
});
