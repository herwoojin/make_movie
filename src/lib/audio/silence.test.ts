import { describe, expect, it } from 'vitest';
import { DEFAULT_SILENCE_PARAMS, detectSilence, detectSilenceRanges, frameLevelsDb, type SilenceParams } from './silence';

const SR = 16000;

/** [ms, 진폭(DC)] 조각을 이어 PCM을 만든다. DC 값 c의 RMS는 |c| 이므로 dB를 정확히 제어할 수 있다. */
function pcmOf(parts: [number, number][]): Float32Array {
  const total = parts.reduce((a, [ms]) => a + Math.round((ms * SR) / 1000), 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const [ms, amp] of parts) {
    const n = Math.round((ms * SR) / 1000);
    out.fill(amp, off, off + n);
    off += n;
  }
  return out;
}
const dbToAmp = (db: number) => 10 ** (db / 20);
const LOUD = 0.5;
const QUIET = 0;

const params = (p: Partial<SilenceParams> = {}): SilenceParams => ({ ...DEFAULT_SILENCE_PARAMS, ...p });

describe('frameLevelsDb', () => {
  it('20ms 프레임 RMS를 dBFS로', () => {
    const levels = frameLevelsDb(pcmOf([[40, dbToAmp(-20)], [20, 0]]), SR);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toBeCloseTo(-20, 3);
    expect(levels[2]).toBe(-120);
  });
  it('마지막 짧은 프레임도 계산', () => {
    const pcm = new Float32Array(330).fill(1);
    expect(frameLevelsDb(pcm, SR)).toHaveLength(2);
  });
});

describe('detectSilence', () => {
  it('완전 무음 → 전체가 하나의 제안', () => {
    const out = detectSilence(pcmOf([[3000, QUIET]]), SR, params(), 'p1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 3000, source: 'silence', decision: 'pending', projectId: 'p1' });
    expect(out[0].confidence).toBe(1);
  });

  it('무음 없음 → 빈 배열', () => {
    expect(detectSilence(pcmOf([[3000, LOUD]]), SR, params())).toEqual([]);
  });

  it('빈 PCM → 빈 배열', () => {
    expect(detectSilence(new Float32Array(0), SR, params())).toEqual([]);
  });

  it('minSilenceMs보다 짧은 무음 → 무시됨', () => {
    const pcm = pcmOf([[1000, LOUD], [300, QUIET], [1000, LOUD]]);
    expect(detectSilence(pcm, SR, params({ minSilenceMs: 500 }))).toEqual([]);
  });

  it('충분히 긴 무음은 padding을 뺀 구간으로 제안', () => {
    const pcm = pcmOf([[1000, LOUD], [1000, QUIET], [1000, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 200 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[1200, 1800]]);
    expect(out[0].id).toBe('silence-1200-1800');
  });

  it('padding 적용 후 구간이 음수 길이가 되면 제안에서 제외', () => {
    const pcm = pcmOf([[1000, LOUD], [500, QUIET], [1000, LOUD]]);
    expect(detectSilence(pcm, SR, params({ minSilenceMs: 500, paddingMs: 300 }))).toEqual([]);
  });

  it('padding 후 길이가 정확히 0이어도 제외', () => {
    const pcm = pcmOf([[1000, LOUD], [600, QUIET], [1000, LOUD]]);
    expect(detectSilence(pcm, SR, params({ minSilenceMs: 500, paddingMs: 300 }))).toEqual([]);
  });

  it('minKeepMs 미만 유지구간은 앞뒤 컷과 병합', () => {
    const pcm = pcmOf([[1000, LOUD], [1000, QUIET], [200, LOUD], [1000, QUIET], [1000, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 0, minKeepMs: 300 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 3200]]);
  });

  it('minKeepMs 이상 유지구간은 병합하지 않음', () => {
    const pcm = pcmOf([[1000, LOUD], [1000, QUIET], [500, LOUD], [1000, QUIET], [1000, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 0, minKeepMs: 300 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 2000], [2500, 3500]]);
  });

  it('맨 앞·맨 뒤의 짧은 유지구간도 컷에 흡수', () => {
    const pcm = pcmOf([[100, LOUD], [1000, QUIET], [1000, LOUD], [1000, QUIET], [100, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 0, minKeepMs: 300 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[0, 1100], [2100, 3200]]);
  });

  it('파일 가장자리 무음에는 padding을 두지 않는다', () => {
    const pcm = pcmOf([[1000, QUIET], [1000, LOUD], [1000, QUIET]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 200 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[0, 800], [2200, 3000]]);
  });

  it('히스테리시스: 진입~이탈 사이(-33dB) 소리는 무음을 끊지 않는다', () => {
    const between = dbToAmp(-33);
    const pcm = pcmOf([[1000, LOUD], [400, dbToAmp(-60)], [200, between], [400, dbToAmp(-60)], [1000, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 0, minSilenceMs: 500 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 2000]]);
  });

  it('히스테리시스: 무음이 아닌 상태에서 -33dB는 무음으로 진입하지 않는다', () => {
    const pcm = pcmOf([[1000, LOUD], [1000, dbToAmp(-33)], [1000, LOUD]]);
    expect(detectSilence(pcm, SR, params())).toEqual([]);
  });

  it('이탈 임계(-32dB)를 넘으면 무음이 끝난다', () => {
    const pcm = pcmOf([[1000, LOUD], [600, dbToAmp(-60)], [200, dbToAmp(-30)], [600, dbToAmp(-60)], [1000, LOUD]]);
    const out = detectSilence(pcm, SR, params({ paddingMs: 0, minSilenceMs: 500, minKeepMs: 100 }));
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 1600], [1800, 2400]]);
  });

  it('confidence는 임계보다 얼마나 조용한지에 비례', () => {
    const pcm = pcmOf([[1000, LOUD], [1000, dbToAmp(-50)], [1000, LOUD]]);
    const [s] = detectSilence(pcm, SR, params({ paddingMs: 0 }));
    expect(s.confidence).toBeCloseTo(0.5, 2);
  });

  it('detectSilenceRanges는 레벨 배열만으로 동작', () => {
    const levels = new Float32Array([-10, -80, -80, -80, -10]);
    const out = detectSilenceRanges(levels, 100, 500, params({ minSilenceMs: 300, paddingMs: 0, minKeepMs: 0 }));
    expect(out.map((r) => [r.startMs, r.endMs])).toEqual([[100, 400]]);
  });
});
