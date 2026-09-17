import { describe, expect, it } from 'vitest';
import type { SubtitleCue } from '@/types/models';
import { activeCueAt, wrapText } from './model';

function cue(id: string, s: number, e: number, text = id): SubtitleCue {
  return { id, projectId: 'p', idx: 0, startMs: s, endMs: e, sourceStartMs: s, sourceEndMs: e, orphan: false, text, locked: false };
}

describe('wrapText', () => {
  it('단어 단위 줄바꿈', () => {
    expect(wrapText('가나 다라 마바', 5, 3)).toEqual(['가나 다라', '마바']);
  });
  it('긴 단어는 강제로 자름', () => {
    expect(wrapText('abcdefgh', 3, 5)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText('x abcdef', 3, 5)).toEqual(['x', 'abc', 'def']);
  });
  it('넘치는 줄은 마지막 줄에 합침', () => {
    expect(wrapText('a b c d', 1, 2)).toEqual(['a', 'b c d']);
  });
  it('명시적 줄바꿈 존중, 빈 텍스트', () => {
    expect(wrapText('첫줄\n둘째', 20, 2)).toEqual(['첫줄', '둘째']);
    expect(wrapText('', 20, 2)).toEqual(['']);
  });
});

describe('activeCueAt', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  it('결과물 시각의 큐를 찾는다 (끝 시각은 다음 큐에 속한다)', () => {
    expect(activeCueAt(cues, 0)?.id).toBe('a');
    expect(activeCueAt(cues, 999)?.id).toBe('a');
    expect(activeCueAt(cues, 1000)?.id).toBe('b');
    expect(activeCueAt(cues, 2000)).toBeUndefined();
  });
});
