import { describe, expect, it } from 'vitest';
import { clampMs, formatDuration, formatShort, formatTimecode, frameDurationMs, frameToMs, msToFrame, parseTimecode, snapToFrame } from './timecode';

describe('timecode', () => {
  it('formatTimecode', () => {
    expect(formatTimecode(192_000)).toBe('00:03:12');
    expect(formatTimecode(3_723_456, true)).toBe('01:02:03.456');
    expect(formatTimecode(-5)).toBe('00:00:00');
  });
  it('formatShort / formatDuration', () => {
    expect(formatShort(192_450)).toBe('3:12.4');
    expect(formatDuration(800)).toBe('0.8초');
    expect(formatDuration(65_000)).toBe('1분 5초');
    expect(formatDuration(120_000)).toBe('2분');
  });
  it('parseTimecode', () => {
    expect(parseTimecode('00:01:02.500')).toBe(62_500);
    expect(parseTimecode('01:02,5')).toBe(62_500);
    expect(parseTimecode('62.5')).toBe(62_500);
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('')).toBeNull();
  });
  it('프레임 변환', () => {
    expect(msToFrame(1000, 30)).toBe(30);
    expect(frameToMs(45, 30)).toBe(1500);
    expect(snapToFrame(1010, 30)).toBe(1000);
    expect(frameDurationMs(0)).toBeCloseTo(33.33, 1);
    expect(msToFrame(1000, 0)).toBe(30);
    expect(frameToMs(30, -1)).toBe(1000);
  });
  it('clampMs', () => {
    expect(clampMs(5.6, 0, 10)).toBe(6);
    expect(clampMs(-1, 0, 10)).toBe(0);
    expect(clampMs(11, 0, 10)).toBe(10);
  });
});
