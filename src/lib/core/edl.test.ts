import { describe, expect, it } from 'vitest';
import type { EdlSegment } from '@/types/models';
import {
  applySuggestions, createInitialEdl, isSourceKept, keptRanges, mergeRanges, moveBoundary, nextKeptSourceMs,
  outputDurationMs, outputToSource, prevKeptSourceMs, removedRanges, revertAuto, segmentAt, setSegmentEnabled,
  sortSegments, sourceDurationMs, sourceToOutput, splitAt, toggleSegment,
} from './edl';

function ids() {
  let n = 0;
  return () => `s${++n}`;
}

function seg(start: number, end: number, enabled = true, order = 0, id = `x${start}`): EdlSegment {
  return { id, projectId: 'p', assetId: 'a', order, sourceStartMs: start, sourceEndMs: end, enabled, origin: 'initial', updatedAt: 0 };
}

/** 0~1000 유지, 1000~2000 삭제, 2000~3000 유지 */
const cutMiddle = (): EdlSegment[] => [seg(0, 1000, true, 0), seg(1000, 2000, false, 1), seg(2000, 3000, true, 2)];

describe('createInitialEdl', () => {
  it('원본 전체를 덮는 구간 하나를 만든다', () => {
    const edl = createInitialEdl('p', 'a', 5000.4, 7, ids());
    expect(edl).toEqual([{ id: 's1', projectId: 'p', assetId: 'a', order: 0, sourceStartMs: 0, sourceEndMs: 5000, enabled: true, origin: 'initial', updatedAt: 7 }]);
  });
  it('음수 길이는 0으로', () => {
    expect(createInitialEdl('p', 'a', -5)[0].sourceEndMs).toBe(0);
  });
});

describe('sourceToOutput', () => {
  it('빈 EDL은 항상 null', () => {
    expect(sourceToOutput(0, [])).toBeNull();
  });
  it('잘리지 않은 구간은 그대로', () => {
    expect(sourceToOutput(500, cutMiddle())).toBe(500);
    expect(sourceToOutput(0, cutMiddle())).toBe(0);
  });
  it('잘린 구간은 null', () => {
    expect(sourceToOutput(1500, cutMiddle())).toBeNull();
  });
  it('잘린 구간 뒤는 앞으로 당겨진다', () => {
    expect(sourceToOutput(2500, cutMiddle())).toBe(1500);
    expect(sourceToOutput(3000, cutMiddle())).toBe(2000);
  });
  it('경계값: 유지구간 끝은 포함', () => {
    expect(sourceToOutput(1000, cutMiddle())).toBe(1000);
    expect(sourceToOutput(2000, cutMiddle())).toBe(1000);
  });
  it('범위 밖은 null', () => {
    expect(sourceToOutput(3001, cutMiddle())).toBeNull();
  });
  it('order 순서가 뒤섞여 들어와도 정렬해서 계산 (구간 사이 빈 곳은 삭제로 간주)', () => {
    const edl = [seg(2000, 3000, true, 1), seg(0, 1000, true, 0)];
    expect(sourceToOutput(2500, edl)).toBe(1500);
    expect(sourceToOutput(1500, edl)).toBeNull();
    const contiguous = [seg(1000, 2000, true, 1), seg(0, 1000, true, 0)];
    expect(sourceToOutput(1500, contiguous)).toBe(1500);
  });
  it('전체 삭제면 null', () => {
    expect(sourceToOutput(10, [seg(0, 1000, false)])).toBeNull();
  });
});

describe('outputToSource', () => {
  it('앞 구간', () => {
    expect(outputToSource(500, cutMiddle())).toBe(500);
  });
  it('뒤 구간은 잘린 길이만큼 뒤로', () => {
    expect(outputToSource(1500, cutMiddle())).toBe(2500);
  });
  it('경계: bias=start면 다음 구간 시작, bias=end면 이전 구간 끝', () => {
    expect(outputToSource(1000, cutMiddle(), 'start')).toBe(2000);
    expect(outputToSource(1000, cutMiddle(), 'end')).toBe(1000);
  });
  it('결과물 끝은 마지막 구간 끝', () => {
    expect(outputToSource(2000, cutMiddle())).toBe(3000);
    expect(outputToSource(2000, cutMiddle(), 'end')).toBe(3000);
  });
  it('범위 밖·음수·빈 EDL은 null', () => {
    expect(outputToSource(2001, cutMiddle())).toBeNull();
    expect(outputToSource(-1, cutMiddle())).toBeNull();
    expect(outputToSource(0, [])).toBeNull();
  });
  it('sourceToOutput과 왕복', () => {
    const edl = cutMiddle();
    for (const out of [0, 250, 999, 1001, 1999]) {
      const src = outputToSource(out, edl)!;
      expect(sourceToOutput(src, edl)).toBe(out);
    }
  });
});

describe('길이 계산', () => {
  it('outputDurationMs / sourceDurationMs', () => {
    expect(outputDurationMs(cutMiddle())).toBe(2000);
    expect(sourceDurationMs(cutMiddle())).toBe(3000);
    expect(outputDurationMs([])).toBe(0);
  });
});

describe('splitAt', () => {
  it('구간 내부를 둘로 나눈다', () => {
    const edl = createInitialEdl('p', 'a', 3000, 0, ids());
    const out = splitAt(edl, 1200, () => 'new', 5);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 's1', sourceStartMs: 0, sourceEndMs: 1200, order: 0, updatedAt: 5 });
    expect(out[1]).toMatchObject({ id: 'new', sourceStartMs: 1200, sourceEndMs: 3000, order: 1, origin: 'manual-split' });
  });
  it('경계·범위 밖이면 그대로(같은 참조)', () => {
    const edl = cutMiddle();
    expect(splitAt(edl, 1000)).toBe(edl);
    expect(splitAt(edl, 0)).toBe(edl);
    expect(splitAt(edl, 99999)).toBe(edl);
  });
  it('소수 ms는 반올림', () => {
    const out = splitAt(createInitialEdl('p', 'a', 100), 40.6);
    expect(out[0].sourceEndMs).toBe(41);
  });
  it('원본 배열을 변경하지 않는다', () => {
    const edl = createInitialEdl('p', 'a', 3000);
    const copy = JSON.parse(JSON.stringify(edl));
    splitAt(edl, 1000);
    expect(edl).toEqual(copy);
  });
});

describe('toggleSegment / setSegmentEnabled', () => {
  it('켜기·끄기', () => {
    const edl = cutMiddle();
    const out = toggleSegment(edl, 'x1000', 9);
    expect(out[1]).toMatchObject({ enabled: true, updatedAt: 9 });
    expect(toggleSegment(out, 'x1000')[1].enabled).toBe(false);
  });
  it('없는 id는 그대로', () => {
    const edl = cutMiddle();
    expect(toggleSegment(edl, 'nope')).toBe(edl);
  });
  it('setSegmentEnabled는 값이 같으면 객체를 유지', () => {
    const edl = cutMiddle();
    const out = setSegmentEnabled(edl, 'x0', true);
    expect(out[0]).toBe(edl[0]);
    expect(setSegmentEnabled(edl, 'x0', false)[0].enabled).toBe(false);
  });
});

describe('applySuggestions', () => {
  it('제안 구간을 잘라 비활성으로 만든다', () => {
    const edl = createInitialEdl('p', 'a', 5000, 0, ids());
    const out = applySuggestions(edl, [{ startMs: 1000, endMs: 2000, source: 'silence' }], ids(), 1);
    expect(keptRanges(out)).toEqual([{ startMs: 0, endMs: 1000 }, { startMs: 2000, endMs: 5000 }]);
    const cut = out.find((s) => !s.enabled)!;
    expect(cut).toMatchObject({ sourceStartMs: 1000, sourceEndMs: 2000, origin: 'auto-silence' });
    expect(outputDurationMs(out)).toBe(4000);
  });
  it('여러 제안(순서 무관) + filler origin', () => {
    const edl = createInitialEdl('p', 'a', 5000);
    const out = applySuggestions(edl, [
      { startMs: 3000, endMs: 3500, source: 'filler' },
      { startMs: 500, endMs: 800, source: 'silence' },
    ]);
    expect(removedRanges(out)).toEqual([{ startMs: 500, endMs: 800 }, { startMs: 3000, endMs: 3500 }]);
    expect(out.find((s) => s.sourceStartMs === 3000)!.origin).toBe('auto-filler');
    expect(sortSegments(out).map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
  });
  it('시작=0, 끝=원본끝 경계 제안', () => {
    const edl = createInitialEdl('p', 'a', 2000);
    const out = applySuggestions(edl, [{ startMs: 0, endMs: 500, source: 'silence' }, { startMs: 1500, endMs: 2000, source: 'silence' }]);
    expect(keptRanges(out)).toEqual([{ startMs: 500, endMs: 1500 }]);
  });
  it('전체 삭제', () => {
    const out = applySuggestions(createInitialEdl('p', 'a', 2000), [{ startMs: 0, endMs: 2000, source: 'silence' }]);
    expect(outputDurationMs(out)).toBe(0);
    expect(keptRanges(out)).toEqual([]);
  });
  it('길이 0 이하 제안은 무시', () => {
    const edl = createInitialEdl('p', 'a', 2000);
    expect(applySuggestions(edl, [{ startMs: 500, endMs: 500, source: 'silence' }])).toBe(edl);
  });
  it('이미 잘린 구간과 겹쳐도 안전', () => {
    const edl = applySuggestions(createInitialEdl('p', 'a', 3000), [{ startMs: 1000, endMs: 2000, source: 'silence' }]);
    const out = applySuggestions(edl, [{ startMs: 1500, endMs: 2500, source: 'silence' }]);
    expect(keptRanges(out)).toEqual([{ startMs: 0, endMs: 1000 }, { startMs: 2500, endMs: 3000 }]);
  });
});

describe('revertAuto', () => {
  it('자동 컷을 되돌리고 조각을 다시 합친다', () => {
    const edl = createInitialEdl('p', 'a', 5000, 0, ids());
    const cut = applySuggestions(edl, [{ startMs: 1000, endMs: 2000, source: 'silence' }, { startMs: 3000, endMs: 4000, source: 'filler' }]);
    const out = revertAuto(cut);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 's1', sourceStartMs: 0, sourceEndMs: 5000, enabled: true, origin: 'initial' });
  });
  it('수동으로 끈 구간과 수동 분할점은 유지', () => {
    let edl = createInitialEdl('p', 'a', 6000);
    edl = splitAt(edl, 5000);
    const manualOff = sortSegments(edl)[1].id;
    edl = setSegmentEnabled(edl, manualOff, false);
    edl = applySuggestions(edl, [{ startMs: 1000, endMs: 2000, source: 'silence' }]);
    const out = sortSegments(revertAuto(edl));
    expect(out.map((s) => [s.sourceStartMs, s.sourceEndMs, s.enabled])).toEqual([[0, 5000, true], [5000, 6000, false]]);
  });
  it('자동 컷이 맨 앞이어도 origin은 initial로', () => {
    const cut = applySuggestions(createInitialEdl('p', 'a', 2000), [{ startMs: 0, endMs: 1000, source: 'silence' }]);
    const out = revertAuto(cut);
    expect(out).toHaveLength(1);
    expect(out[0].origin).toBe('initial');
  });
});

describe('moveBoundary', () => {
  it('경계를 옮기고 양쪽 구간을 함께 조정', () => {
    const out = moveBoundary(cutMiddle(), 'x0', 1033);
    expect(out[0].sourceEndMs).toBe(1033);
    expect(out[1].sourceStartMs).toBe(1033);
  });
  it('최소 길이로 제한', () => {
    const out = moveBoundary(cutMiddle(), 'x0', 5000, 33);
    expect(out[0].sourceEndMs).toBe(1967);
    const back = moveBoundary(cutMiddle(), 'x0', -100, 33);
    expect(back[0].sourceEndMs).toBe(33);
  });
  it('오른쪽 구간이 없거나 맞닿지 않으면 그대로', () => {
    const edl = cutMiddle();
    expect(moveBoundary(edl, 'x2000', 2500)).toBe(edl);
    expect(moveBoundary(edl, 'nope', 2500)).toBe(edl);
    const gap = [seg(0, 1000, true, 0, 'a1'), seg(1500, 2000, true, 1, 'a2')];
    expect(moveBoundary(gap, 'a1', 1200)).toBe(gap);
    expect(moveBoundary(edl, 'x0', 1000)).toBe(edl);
  });
});

describe('조회 헬퍼', () => {
  it('segmentAt / isSourceKept', () => {
    expect(segmentAt(cutMiddle(), 1500)?.id).toBe('x1000');
    expect(segmentAt(cutMiddle(), 3000)).toBeUndefined();
    expect(isSourceKept(500, cutMiddle())).toBe(true);
    expect(isSourceKept(1500, cutMiddle())).toBe(false);
  });
  it('nextKeptSourceMs / prevKeptSourceMs', () => {
    expect(nextKeptSourceMs(1500, cutMiddle())).toBe(2000);
    expect(nextKeptSourceMs(500, cutMiddle())).toBe(500);
    expect(nextKeptSourceMs(3000, cutMiddle())).toBeNull();
    expect(prevKeptSourceMs(1500, cutMiddle())).toBe(1000);
    expect(prevKeptSourceMs(2500, cutMiddle())).toBe(2500);
    expect(prevKeptSourceMs(0, cutMiddle())).toBeNull();
  });
  it('mergeRanges는 겹치거나 맞닿은 구간을 합치고 빈 구간은 버린다', () => {
    expect(mergeRanges([{ startMs: 5, endMs: 9 }, { startMs: 0, endMs: 5 }, { startMs: 20, endMs: 20 }, { startMs: 7, endMs: 12 }]))
      .toEqual([{ startMs: 0, endMs: 12 }]);
  });
});
