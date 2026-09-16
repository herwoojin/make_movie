import { describe, expect, it } from 'vitest';
import { computePeaks, downsamplePeaks, peakCount } from './peaks';

describe('peaks', () => {
  it('초당 100포인트 min/max', () => {
    const sr = 16000;
    const pcm = new Float32Array(sr); // 1초
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
    const peaks = computePeaks(pcm, sr);
    expect(peakCount(peaks)).toBe(100);
    expect(peaks[1]).toBeGreaterThan(60);
    expect(peaks[1]).toBeLessThanOrEqual(64);
    expect(peaks[0]).toBeLessThan(-60);
  });

  it('무음은 0, 범위를 넘는 값은 클램프', () => {
    const pcm = new Float32Array(320);
    pcm[200] = 2;
    pcm[201] = -2;
    const peaks = computePeaks(pcm, 16000);
    expect(Array.from(peaks.slice(0, 2))).toEqual([0, 0]);
    expect(Array.from(peaks.slice(2, 4))).toEqual([-128, 127]);
  });

  it('downsamplePeaks는 min의 min, max의 max', () => {
    const peaks = new Int8Array([-10, 10, -50, 20, -5, 90]);
    expect(Array.from(downsamplePeaks(peaks, 2))).toEqual([-50, 20, -5, 90]);
    expect(downsamplePeaks(peaks, 1)).toBe(peaks);
    expect(Array.from(downsamplePeaks(peaks, 10))).toEqual([-50, 90]);
  });
});
