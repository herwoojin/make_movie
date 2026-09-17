import { describe, expect, it } from 'vitest';
import type { EditClip, TranscriptWord } from '@/types/models';
import {
  applyWordCuts, buildClipsFromWords, captionFromWords, clipAtSource, clipKeptRanges, clipSpeedRanges, clipToEdlSegments,
  clipWords, deleteWord, recalcClipDuration, renumberClips, resetCaption, restoreWord, restoreWordCut, setCaptionText,
  setClipEnabled, wordCutRanges, type ClipState,
} from './clips';
import { createInitialEdl, keptRanges, sourceToOutput } from './edl';

function ids() {
  let n = 0;
  return () => `c${++n}`;
}

function word(idx: number, text: string, startMs: number, endMs: number): TranscriptWord {
  return { id: `w${idx}`, transcriptId: 't', idx, startMs, endMs, text, isFiller: false, clipId: '', deleted: false };
}

/** 0.9초까지 "안녕하세요", 1.0~1.2 "음", 1.25~1.4 "어", 1.6~2.0 "반갑습니다." — 3초짜리 한 클립 */
function sample(): ClipState {
  const words = [
    word(0, '안녕하세요', 300, 900),
    word(1, '음', 1000, 1200),
    word(2, '어', 1250, 1400),
    word(3, '반갑습니다.', 1600, 2000),
  ];
  const state = buildClipsFromWords(words, { projectId: 'p', idGen: ids() });
  return state;
}

describe('buildClipsFromWords', () => {
  it('문장부호·간격·글자수로 클립을 나누고 단어에 clipId를 붙인다', () => {
    const words = [
      word(0, '안녕하세요.', 0, 500),
      word(1, '오늘은', 600, 900),
      word(2, '날씨가', 950, 1200),
      word(3, '좋네요', 3000, 3400), // 0.7초 이상 간격 → 새 클립
    ];
    const { clips, words: out } = buildClipsFromWords(words, { projectId: 'p', idGen: ids() });
    expect(clips.map((c) => c.captionText)).toEqual(['안녕하세요.', '오늘은 날씨가', '좋네요']);
    expect(clips.map((c) => c.idx)).toEqual([0, 1, 2]);
    expect(clips[1]).toMatchObject({ sourceStartMs: 600, sourceEndMs: 1200, enabled: true, speed: 1, captionEdited: false, sourceKind: 'video-edit' });
    expect(out.every((w) => w.clipId)).toBe(true);
    expect(clipWords(out, clips[1].id).map((w) => w.text)).toEqual(['오늘은', '날씨가']);
  });

  it('빈 단어는 건너뛰고, 긴 문장은 글자 수로 끊는다', () => {
    const words = [word(0, '  ', 0, 10), word(1, 'a'.repeat(30), 100, 500), word(2, 'b'.repeat(30), 550, 900)];
    const { clips } = buildClipsFromWords(words, { projectId: 'p', maxChars: 40, idGen: ids() });
    expect(clips).toHaveLength(2);
  });
});

describe('단어 칩 삭제', () => {
  it('단어 하나 삭제 → 클립 길이가 그 단어(+앞뒤 여백)만큼 줄어든다', () => {
    const state = sample();
    const clip = state.clips[0];
    const before = recalcClipDuration(clip, state.words);
    const after = deleteWord(state, 'w1', 1);
    const afterClip = after.clips[0];
    expect(before - recalcClipDuration(afterClip, after.words)).toBe(260); // 200ms 단어 + 앞뒤 30ms
    expect(afterClip.captionText).toBe('안녕하세요 어 반갑습니다.');
    expect(afterClip.enabled).toBe(true);
  });

  it('클립의 모든 단어를 지우면 enabled=false 가 된다', () => {
    let state = sample();
    for (const id of ['w0', 'w1', 'w2', 'w3']) state = deleteWord(state, id, 1);
    expect(state.clips[0].enabled).toBe(false);
    expect(state.clips[0].captionText).toBe('');
    expect(recalcClipDuration(state.clips[0], state.words)).toBe(0);
  });

  it('인접한 단어를 연속으로 지우면 잘라낼 구간이 하나로 병합된다 (간격 150ms 미만)', () => {
    let state = sample();
    state = deleteWord(state, 'w1', 1);
    state = deleteWord(state, 'w2', 2);
    const cuts = wordCutRanges(clipWords(state.words, state.clips[0].id));
    expect(cuts).toEqual([{ startMs: 970, endMs: 1430 }]);
    const segs = clipToEdlSegments(state.clips[0], state.words, 'a', ids());
    expect(segs.map((s) => [s.sourceStartMs, s.sourceEndMs])).toEqual([[300, 970], [1430, 2000]]);
  });

  it('간격 150ms 이상 떨어진 단어 두 개를 지우면 구간이 둘로 나뉜다', () => {
    const words = [
      word(0, '하나', 0, 300),
      word(1, '지움A', 400, 600),
      word(2, '가운데', 900, 1200),
      word(3, '지움B', 1500, 1700),
      word(4, '끝', 2000, 2300),
    ];
    let state = buildClipsFromWords(words, { projectId: 'p', gapMs: 5000, maxChars: 999, idGen: ids() });
    state = deleteWord(state, 'w1', 1);
    state = deleteWord(state, 'w3', 2);
    const cuts = wordCutRanges(state.words);
    expect(cuts).toEqual([{ startMs: 370, endMs: 630 }, { startMs: 1470, endMs: 1730 }]);
    expect(clipKeptRanges(state.clips[0], state.words)).toEqual([
      { startMs: 0, endMs: 370 }, { startMs: 630, endMs: 1470 }, { startMs: 1730, endMs: 2300 },
    ]);
  });

  it('삭제 후 복원하면 원래 상태와 정확히 같아진다', () => {
    const state = sample();
    const restored = restoreWord(deleteWord(state, 'w1', 123), 'w1');
    expect(restored).toEqual(state);
  });

  it('없는 단어·이미 지운 단어는 상태를 바꾸지 않는다', () => {
    const state = sample();
    expect(deleteWord(state, 'nope')).toBe(state);
    const once = deleteWord(state, 'w1', 1);
    expect(deleteWord(once, 'w1', 2)).toBe(once);
    expect(restoreWord(state, 'w1')).toBe(state);
  });

  it('여백이 이웃 단어를 먹지 않고, 여백 적용 후 길이가 0 이하면 무시한다', () => {
    const words = [word(0, '앞', 0, 100), word(1, '짧', 110, 120), word(2, '뒤', 130, 300)];
    let state = buildClipsFromWords(words, { projectId: 'p', maxChars: 999, idGen: ids() });
    state = deleteWord(state, 'w1', 1);
    expect(wordCutRanges(state.words)).toEqual([{ startMs: 100, endMs: 130 }]);
  });
});

describe('자막 줄 직접 수정', () => {
  it('captionEdited=true 면 단어를 지워도 captionText가 덮어써지지 않는다', () => {
    let state = sample();
    state = setCaptionText(state, state.clips[0].id, '내가 직접 쓴 자막');
    expect(state.clips[0].captionEdited).toBe(true);
    state = deleteWord(state, 'w1', 1);
    expect(state.clips[0].captionText).toBe('내가 직접 쓴 자막');
    // 자동 생성본은 계속 갱신되어 "자동 생성으로 되돌리기"가 최신 상태를 준다
    expect(state.clips[0].captionTextOriginal).toBe('안녕하세요 어 반갑습니다.');
    state = resetCaption(state, state.clips[0].id);
    expect(state.clips[0]).toMatchObject({ captionText: '안녕하세요 어 반갑습니다.', captionEdited: false });
  });

  it('원본과 같은 글자로 되돌려 쓰면 captionEdited가 다시 false', () => {
    const state = sample();
    const same = setCaptionText(state, state.clips[0].id, state.clips[0].captionTextOriginal);
    expect(same.clips[0].captionEdited).toBe(false);
  });
});

describe('클립 켜고 끄기', () => {
  it('클립을 끄면 그 안의 단어가 모두 지워진 것으로 표시되고, 다시 켜면 살아난다', () => {
    const state = sample();
    const off = setClipEnabled(state, state.clips[0].id, false, 5);
    expect(off.clips[0].enabled).toBe(false);
    expect(off.words.every((w) => w.deleted)).toBe(true);
    expect(clipToEdlSegments(off.clips[0], off.words, 'a', ids())).toEqual([]);
    const on = setClipEnabled(off, state.clips[0].id, true);
    expect(on.words.every((w) => !w.deleted)).toBe(true);
    expect(on.clips[0].enabled).toBe(true);
  });
});

describe('EDL 반영과 배속', () => {
  it('단어 삭제를 EDL에 반영하면 해당 구간이 빠지고, 되돌리면 살아난다', () => {
    let state = sample();
    state = deleteWord(state, 'w1', 1);
    const edl = applyWordCuts(createInitialEdl('p', 'a', 3000, 0, ids()), state.words, state.clips[0].id, ids(), 1);
    expect(keptRanges(edl)).toEqual([{ startMs: 0, endMs: 970 }, { startMs: 1230, endMs: 3000 }]);
    const restored = restoreWordCut(edl, state.words.find((w) => w.id === 'w1')!);
    expect(keptRanges(restored)).toEqual([{ startMs: 0, endMs: 3000 }]);
  });

  it('배속 1.5배 + 단어 삭제가 같이 걸린 경우의 sourceToOutput', () => {
    let state = sample();
    state = deleteWord(state, 'w1', 1); // 970~1230 잘림 (260ms)
    const edl = applyWordCuts(createInitialEdl('p', 'a', 3000, 0, ids()), state.words, state.clips[0].id, ids(), 1);
    const speeds = clipSpeedRanges(state.clips.map((c) => ({ ...c, speed: 1.5 })));
    expect(speeds).toEqual([{ startMs: 300, endMs: 2000, speed: 1.5 }]);

    // 0~300: 1배속 → 300. 300~970: 1.5배속 → 670/1.5 = 446.7 → 누적 746.7
    expect(sourceToOutput(300, edl, speeds)).toBe(300);
    expect(sourceToOutput(970, edl, speeds)).toBe(747);
    // 잘린 구간은 null
    expect(sourceToOutput(1100, edl, speeds)).toBeNull();
    // 1230~2000: 1.5배속 770/1.5 = 513.3 → 746.7 + 513.3 = 1260
    expect(sourceToOutput(2000, edl, speeds)).toBe(1260);
    // 2000~3000: 다시 1배속 → 2260
    expect(sourceToOutput(3000, edl, speeds)).toBe(2260);
  });

  it('clipSpeedRanges는 꺼진 클립을 제외한다', () => {
    const state = sample();
    const off = setClipEnabled(state, state.clips[0].id, false);
    expect(clipSpeedRanges(off.clips)).toEqual([]);
  });
});

describe('보조 함수', () => {
  it('captionFromWords / clipAtSource / renumberClips', () => {
    const state = sample();
    expect(captionFromWords(state.words)).toBe('안녕하세요 음 어 반갑습니다.');
    expect(clipAtSource(state.clips, 1000)?.id).toBe(state.clips[0].id);
    expect(clipAtSource(state.clips, 5000)).toBeUndefined();
    const shuffled: EditClip[] = [{ ...state.clips[0], idx: 7 }];
    expect(renumberClips(shuffled)[0].idx).toBe(0);
  });
});
