import { describe, expect, it } from 'vitest';
import { formatBytes } from '@/lib/utils';
import { freeBytes, hasRoomFor, usageRatio } from './quota';

describe('quota', () => {
  it('원본 크기의 3배 여유가 있어야 true', () => {
    const est = { usage: 100, quota: 400 };
    expect(freeBytes(est)).toBe(300);
    expect(hasRoomFor(est, 100)).toBe(true);
    expect(hasRoomFor(est, 101)).toBe(false);
    expect(hasRoomFor(est, 150, 2)).toBe(true);
  });
  it('사용량이 할당량을 넘어도 음수가 아님', () => {
    expect(freeBytes({ usage: 500, quota: 400 })).toBe(0);
    expect(usageRatio({ usage: 500, quota: 400 })).toBe(1);
    expect(usageRatio({ usage: 0, quota: 0 })).toBe(0);
  });
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(500 * 1024 * 1024)).toBe('500MB');
    expect(formatBytes(-1)).toBe('-');
  });
});
