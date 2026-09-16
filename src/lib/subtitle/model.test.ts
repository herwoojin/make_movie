import { describe, expect, it } from 'vitest';
import type { EdlSegment, SubtitleCue, WordLike } from '@/types/models';
import { applySuggestions, createInitialEdl } from '@/lib/core/edl';
import {
  activeCueAt, attachOrphanToNearest, findOverlaps, findReplace, mergeWithNext, remapCues, renumberCues,
  setCueSourceTiming, setCueTiming, splitCue, wordsToCues, wrapText,
} from './model';

const ids = () => { let n = 0; return () => `c${++n}`; };
const w = (text: string, startMs: number, endMs: number): WordLike => ({ text, startMs, endMs });

function cue(id: string, s: number, e: number, text = id, extra: Partial<SubtitleCue> = {}): SubtitleCue {
  return { id, projectId: 'p', idx: 0, startMs: s, endMs: e, sourceStartMs: s, sourceEndMs: e, orphan: false, text, locked: false, ...extra };
}
const fullEdl = (ms = 10_000) => createInitialEdl('p', 'a', ms, 0, () => 'seg');
const cutEdl = (s: number, e: number, total = 10_000): EdlSegment[] => applySuggestions(fullEdl(total), [{ startMs: s, endMs: e, source: 'silence' }]);

describe('wordsToCues', () => {
  const base = { projectId: 'p', maxCharsPerLine: 24, maxLines: 2, idGen: ids() };
  it('문장부호에서 끊는다', () => {
    const cues = wordsToCues([w('안녕하세요.', 0, 500), w('오늘은', 600, 900), w('날씨가', 950, 1200), w('좋네요', 1250, 1600)], base);
    expect(cues.map((c) => c.text)).toEqual(['안녕하세요.', '오늘은 날씨가 좋네요']);
    expect(cues[1]).toMatchObject({ startMs: 600, endMs: 1600, sourceStartMs: 600, idx: 1, orphan: false });
  });
  it('0.7초 이상 간격에서 끊는다', () => {
    const cues = wordsToCues([w('하나', 0, 300), w('둘', 1000, 1300)], { ...base, idGen: ids() });
    expect(cues).toHaveLength(2);
  });
  it('글자 수 한도(한 줄 × 줄 수)에서 끊는다', () => {
    const cues = wordsToCues([w('가나다라', 0, 100), w('마바사아', 100, 200), w('자차카타', 200, 300)], { ...base, maxCharsPerLine: 5, maxLines: 2, idGen: ids() });
    expect(cues.map((c) => c.text)).toEqual(['가나다라 마바사아', '자차카타']);
  });
  it('빈 단어는 건너뛰고, edl이 있으면 결과물 시간으로 매핑', () => {
    const cues = wordsToCues([w('  ', 0, 10), w('뒤', 3000, 3500)], { ...base, idGen: ids(), edl: cutEdl(1000, 2000) });
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startMs: 2000, endMs: 2500, sourceStartMs: 3000 });
  });
});

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

describe('remapCues', () => {
  it('컷 뒤 자막은 앞으로 당겨진다', () => {
    const [c] = remapCues([cue('a', 3000, 4000)], cutEdl(1000, 2000));
    expect([c.startMs, c.endMs, c.orphan]).toEqual([2000, 3000, false]);
  });
  it('완전히 잘린 자막은 삭제하지 않고 orphan', () => {
    const [c] = remapCues([cue('a', 1200, 1800)], cutEdl(1000, 2000));
    expect(c.orphan).toBe(true);
    expect(c.text).toBe('a');
  });
  it('일부만 잘리면 남은 부분으로 줄인다', () => {
    const [c] = remapCues([cue('a', 500, 1500)], cutEdl(1000, 2000));
    expect([c.startMs, c.endMs]).toEqual([500, 1000]);
    const [d] = remapCues([cue('b', 1500, 2500)], cutEdl(1000, 2000));
    expect([d.startMs, d.endMs]).toEqual([1000, 1500]);
  });
  it('컷을 가로지르는 자막', () => {
    const [c] = remapCues([cue('a', 500, 2500)], cutEdl(1000, 2000));
    expect([c.startMs, c.endMs]).toEqual([500, 1500]);
  });
  it('컷을 되돌리면 orphan이 풀린다', () => {
    const [orphan] = remapCues([cue('a', 1200, 1800)], cutEdl(1000, 2000));
    const [back] = remapCues([orphan], fullEdl());
    expect(back).toMatchObject({ orphan: false, startMs: 1200, endMs: 1800 });
  });
  it('변화 없으면 같은 객체', () => {
    const c = cue('a', 100, 200);
    expect(remapCues([c], fullEdl())[0]).toBe(c);
    const o = { ...c, sourceStartMs: 20_000, sourceEndMs: 20_500, orphan: true };
    expect(remapCues([o], fullEdl())[0]).toBe(o);
  });
  it('컷 경계에서 끝나는 자막은 이전 구간 끝으로', () => {
    const [c] = remapCues([cue('a', 500, 1000)], cutEdl(1000, 2000));
    expect([c.startMs, c.endMs]).toEqual([500, 1000]);
    const [d] = remapCues([cue('b', 2000, 3000)], cutEdl(1000, 2000));
    expect([d.startMs, d.endMs]).toEqual([1000, 2000]);
  });
  it('여러 번 잘라도 누적 오차가 없다', () => {
    let edl = fullEdl();
    let cues = [cue('a', 5000, 6000)];
    edl = applySuggestions(edl, [{ startMs: 1000, endMs: 2000, source: 'silence' }]);
    cues = remapCues(cues, edl);
    edl = applySuggestions(edl, [{ startMs: 3000, endMs: 3500, source: 'silence' }]);
    cues = remapCues(cues, edl);
    expect([cues[0].startMs, cues[0].endMs]).toEqual([3500, 4500]);
  });
});

describe('타이밍 조정', () => {
  it('setCueTiming은 결과물 시간을 원본 앵커로 역산', () => {
    const edl = cutEdl(1000, 2000);
    const c = setCueTiming(cue('a', 0, 100), 1200, 1500, edl);
    expect(c).toMatchObject({ startMs: 1200, endMs: 1500, sourceStartMs: 2200, sourceEndMs: 2500 });
  });
  it('setCueTiming은 시작>끝을 보정하고, 범위 밖이면 그대로', () => {
    const c = cue('a', 0, 100);
    const fixed = setCueTiming(c, 500, 400, fullEdl());
    expect(fixed.endMs).toBeGreaterThan(fixed.startMs);
    expect(setCueTiming(c, 99_000, 99_500, fullEdl())).toBe(c);
  });
  it('setCueSourceTiming', () => {
    const c = setCueSourceTiming(cue('a', 0, 100), 2500, 3000, cutEdl(1000, 2000));
    expect([c.startMs, c.endMs]).toEqual([1500, 2000]);
  });
});

describe('1단계 편집', () => {
  it('mergeWithNext', () => {
    const out = mergeWithNext([cue('b', 1000, 2000, '둘'), cue('a', 0, 900, '하나')], 'a');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: '하나 둘', startMs: 0, endMs: 2000, idx: 0 });
    expect(mergeWithNext(out, 'a')).toHaveLength(1);
  });
  it('splitCue는 글자 비율로 시간 분할', () => {
    const out = splitCue([cue('a', 0, 1000, '가나다라')], 'a', 2, () => 'new');
    expect(out.map((c) => [c.id, c.text, c.startMs, c.endMs])).toEqual([['a', '가나', 0, 500], ['new', '다라', 500, 1000]]);
  });
  it('splitCue: 나눌 수 없으면 그대로', () => {
    expect(splitCue([cue('a', 0, 1000, '가')], 'a', 1)).toHaveLength(1);
    expect(splitCue([cue('a', 0, 1000, '가나')], 'zz', 1)).toHaveLength(1);
  });
  it('findReplace는 특수문자를 글자 그대로 찾는다', () => {
    const { cues, count } = findReplace([cue('a', 0, 1, '1.5배 1.5배'), cue('b', 1, 2, '없음')], '1.5', '2', true);
    expect(count).toBe(2);
    expect(cues[0].text).toBe('2배 2배');
    expect(findReplace(cues, '', 'x').count).toBe(0);
    expect(findReplace([cue('a', 0, 1, 'Hello')], 'hello', 'hi', false).cues[0].text).toBe('hi');
  });
  it('renumberCues', () => {
    expect(renumberCues([cue('b', 5, 6), cue('a', 1, 2)]).map((c) => [c.id, c.idx])).toEqual([['a', 0], ['b', 1]]);
  });
});

describe('겹침·활성·고아 처리', () => {
  it('findOverlaps', () => {
    const out = findOverlaps([cue('a', 0, 1000), cue('b', 900, 1500), cue('c', 2000, 2500), cue('d', 2100, 2200, 'd', { orphan: true })]);
    expect([...out].sort()).toEqual(['a', 'b']);
  });
  it('activeCueAt은 orphan 제외', () => {
    const cues = [cue('a', 0, 1000, 'a', { orphan: true }), cue('b', 0, 1000)];
    expect(activeCueAt(cues, 500)?.id).toBe('b');
    expect(activeCueAt(cues, 1000)).toBeUndefined();
  });
  it('attachOrphanToNearest는 가장 가까운 남은 구간으로', () => {
    const edl = cutEdl(1000, 5000);
    const orphan = { ...cue('a', 4000, 4500), orphan: true };
    const fixed = attachOrphanToNearest(orphan, edl);
    expect(fixed.orphan).toBe(false);
    expect([fixed.sourceStartMs, fixed.sourceEndMs]).toEqual([5000, 5500]);
    const early = attachOrphanToNearest({ ...cue('b', 1500, 1800), orphan: true }, edl);
    expect([early.sourceStartMs, early.sourceEndMs]).toEqual([700, 1000]);
  });
  it('attachOrphanToNearest: 남은 구간이 없으면 그대로', () => {
    const edl = cutEdl(0, 10_000);
    const o = { ...cue('a', 1, 2), orphan: true };
    expect(attachOrphanToNearest(o, edl)).toBe(o);
  });
});
