import { describe, expect, it } from 'vitest';
import type { EditClip } from '@/types/models';
import { applySuggestions, createInitialEdl, createTimeMap } from '@/lib/core/edl';
import { clipAtSourceMs, clipCaption, clipOutputRange, clipsToCues, cuesToClips } from './clipCues';

const clip = (id: string, startMs: number, endMs: number, text: string, extra: Partial<EditClip> = {}): EditClip => ({
  id, projectId: 'p', idx: 0, sourceKind: 'video-edit', sourceStartMs: startMs, sourceEndMs: endMs,
  captionText: text, captionTextOriginal: text, captionEdited: false, enabled: true, speed: 1, ...extra,
});

describe('clipAtSourceMs', () => {
  const clips = [clip('a', 0, 1000, '처음'), clip('b', 1000, 2000, '다음'), clip('c', 2000, 3000, '', {}), clip('d', 3000, 4000, '꺼짐', { enabled: false })];
  it('원본 시각의 클립을 찾는다 (빈 자막·꺼진 클립 제외)', () => {
    expect(clipAtSourceMs(clips, 500)?.id).toBe('a');
    expect(clipAtSourceMs(clips, 1000)?.id).toBe('b');
    expect(clipAtSourceMs(clips, 2500)).toBeUndefined();
    expect(clipAtSourceMs(clips, 3500)).toBeUndefined();
    expect(clipAtSourceMs(clips, 9000)).toBeUndefined();
  });
  it('번역 자막이 있으면 그것을 쓴다', () => {
    const c = clip('a', 0, 1000, '원어', { translatedText: '한국어' });
    expect(clipCaption(c)).toBe('원어');
    expect(clipCaption(c, 'translated')).toBe('한국어');
    expect(clipCaption(clip('b', 0, 1, '원어'), 'translated')).toBe('원어');
  });
});

describe('clipsToCues', () => {
  it('컷이 반영된 결과물 시간으로 바뀐다', () => {
    const edl = applySuggestions(createInitialEdl('p', 'a', 6000), [{ startMs: 1000, endMs: 2000, source: 'filler' }]);
    const cues = clipsToCues([clip('a', 0, 1000, '앞'), clip('b', 2000, 3000, '뒤')], edl);
    expect(cues.map((c) => [c.startMs, c.endMs, c.text])).toEqual([[0, 1000, '앞'], [1000, 2000, '뒤']]);
    expect(cues.map((c) => c.idx)).toEqual([0, 1]);
  });

  it('배속이 걸리면 자막 시간도 그만큼 줄어든다', () => {
    const edl = createInitialEdl('p', 'a', 4000);
    const speeds = [{ startMs: 0, endMs: 2000, speed: 2 }];
    const cues = clipsToCues([clip('a', 0, 2000, '빠르게'), clip('b', 2000, 4000, '보통')], edl, speeds);
    expect(cues.map((c) => [c.startMs, c.endMs])).toEqual([[0, 1000], [1000, 3000]]);
  });

  it('완전히 잘려나간 클립과 빈 자막은 제외된다', () => {
    const edl = applySuggestions(createInitialEdl('p', 'a', 4000), [{ startMs: 1000, endMs: 2000, source: 'filler' }]);
    const cues = clipsToCues([clip('gone', 1100, 1900, '사라짐'), clip('ok', 2000, 3000, '남음'), clip('empty', 3000, 3500, '  ')], edl);
    expect(cues.map((c) => c.text)).toEqual(['남음']);
  });
});

describe('clipOutputRange', () => {
  it('지운 단어를 뺀 실제 구간을 결과물 시간으로 준다', () => {
    const words = [
      { id: 'w1', transcriptId: 't', idx: 0, startMs: 0, endMs: 400, text: 'a', isFiller: false, clipId: 'a', deleted: false },
      { id: 'w2', transcriptId: 't', idx: 1, startMs: 600, endMs: 1000, text: 'b', isFiller: false, clipId: 'a', deleted: true },
    ];
    const edl = createInitialEdl('p', 'a', 2000);
    const range = clipOutputRange(clip('a', 0, 1000, 'a'), words, createTimeMap(edl));
    expect(range).toEqual({ startMs: 0, endMs: 570 });
  });
});

describe('cuesToClips (외부 SRT 열기)', () => {
  it('공백으로 칩을 나누고 글자 수에 비례해 시간을 추정한다', () => {
    let n = 0;
    const { clips, words } = cuesToClips([{ startMs: 0, endMs: 1000, text: '안녕 하세요' }], 'p', 'imported', () => `c${++n}`);
    expect(clips[0]).toMatchObject({ id: 'c1', sourceKind: 'source-audio', captionText: '안녕 하세요', enabled: true });
    expect(words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([['안녕', 0, 400], ['하세요', 400, 1000]]);
    expect(words.every((w) => w.clipId === 'c1' && !w.deleted)).toBe(true);
  });
  it('빈 자막도 클립은 만든다(시간 유지)', () => {
    const { clips, words } = cuesToClips([{ startMs: 0, endMs: 500, text: '   ' }], 'p');
    expect(clips).toHaveLength(1);
    expect(words).toHaveLength(0);
  });
});
