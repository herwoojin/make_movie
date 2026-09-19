import { describe, expect, it } from 'vitest';
import type { EditClip } from '@/types/models';
import { applySuggestions, createInitialEdl, createTimeMap } from '@/lib/core/edl';
import { applyCaptionLead, clipAtSourceMs, clipCaption, clipOutputRange, clipsToCues, createCaptionLookup, cuesToClips } from './clipCues';

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
    // 예전에 글자마다 띄어 쓴 일본어 자막도 붙여서 보여 준다. 직접 고친 자막은 그대로
    expect(clipCaption(clip('c', 0, 1, 'ミ ン ク シ ャ ール です。'))).toBe('ミンクシャールです。');
    expect(clipCaption(clip('d', 0, 1, 'ミ ン ク', { captionEdited: true }))).toBe('ミ ン ク');
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

describe('자막 먼저 보여주기 (applyCaptionLead)', () => {
  const cue = (id: string, startMs: number, endMs: number) => ({
    id, projectId: 'p', idx: 0, startMs, endMs, sourceStartMs: startMs, sourceEndMs: endMs, orphan: false, text: id, locked: false,
  });

  it('말이 시작되기 전에 자막을 띄운다', () => {
    const out = applyCaptionLead([cue('a', 2000, 3000), cue('b', 5000, 6000)], 300);
    expect(out.map((c) => c.startMs)).toEqual([1700, 4700]);
    expect(out.map((c) => c.endMs)).toEqual([3000, 6000]); // 끝나는 시각은 그대로
  });

  it('앞 자막이 떠 있는 동안에는 당겨오지 않는다 (겹치지 않게)', () => {
    const out = applyCaptionLead([cue('a', 0, 1000), cue('b', 1100, 2000)], 500);
    expect(out[1].startMs).toBe(1000);
  });

  it('영상 시작(0초) 앞으로는 가지 않는다', () => {
    expect(applyCaptionLead([cue('a', 200, 1000)], 500)[0].startMs).toBe(0);
  });

  it('원래 시작보다 늦어지지 않는다 (이미 겹친 자막이어도)', () => {
    const out = applyCaptionLead([cue('a', 0, 3000), cue('b', 2000, 4000)], 300);
    expect(out[1].startMs).toBe(2000);
  });

  it('0이면 그대로, 너무 크면 1초로 제한', () => {
    const cues = [cue('a', 5000, 6000)];
    expect(applyCaptionLead(cues, 0)[0].startMs).toBe(5000);
    expect(applyCaptionLead(cues, 99_999)[0].startMs).toBe(4000);
    expect(applyCaptionLead(cues, Number.NaN)[0].startMs).toBe(5000);
  });

  it('clipsToCues에 넣으면 SRT·자막 넣은 영상도 같은 타이밍이 된다', () => {
    const edl = createInitialEdl('p', 'a', 10_000);
    const cues = clipsToCues([clip('a', 1000, 2000, '앞'), clip('b', 4000, 5000, '뒤')], edl, [], 1, { leadMs: 300 });
    expect(cues.map((c) => [c.startMs, c.endMs])).toEqual([[700, 2000], [3700, 5000]]);
  });

  it('컷이 걸려도 결과물 시간 기준으로 당긴다', () => {
    // 1~3초를 잘라내면 4초에 시작하던 자막은 결과물 2초에 시작 → 0.3초 먼저 = 1.7초
    const edl = applySuggestions(createInitialEdl('p', 'a', 10_000), [{ startMs: 1000, endMs: 3000, source: 'filler' }]);
    const cues = clipsToCues([clip('a', 4000, 5000, '뒤')], edl, [], 1, { leadMs: 300 });
    expect(cues[0].startMs).toBe(1700);
  });
});

describe('createCaptionLookup (미리보기)', () => {
  const doc = (lead: number) => ({
    clips: [clip('a', 2000, 3000, '안녕')],
    edl: createInitialEdl('p', 'a', 10_000),
    view: { globalSpeed: 1, captionLeadMs: lead },
  });

  it('먼저 보여주기를 켜면 말보다 먼저 자막이 보인다', () => {
    const off = createCaptionLookup();
    expect(off(doc(0), 1800)).toBeUndefined();
    const on = createCaptionLookup();
    expect(on(doc(300), 1800)?.text).toBe('안녕');
    expect(on(doc(300), 1600)).toBeUndefined();
  });

  it('자막 언어를 한국어로 고르면 미리보기에 번역이 보이고, 바꾸면 바로 원어로 바뀐다', () => {
    const lookup = createCaptionLookup();
    const translated = { ...doc(0), clips: [clip('a', 2000, 3000, 'こんにちは', { translatedText: '안녕하세요' })] };
    expect(lookup({ ...translated, view: { ...translated.view, captionLang: 'translated' as const } }, 2500)?.text).toBe('안녕하세요');
    expect(lookup({ ...translated, view: { ...translated.view, captionLang: 'original' as const } }, 2500)?.text).toBe('こんにちは');
  });

  it('잘려 나간 구간에서는 자막을 보여주지 않는다 (결과물 기준)', () => {
    const lookup = createCaptionLookup();
    const cut = { ...doc(0), edl: applySuggestions(createInitialEdl('p', 'a', 10_000), [{ startMs: 2000, endMs: 3000, source: 'filler' }]) };
    expect(lookup(cut, 2500)).toBeUndefined();
  });
});
