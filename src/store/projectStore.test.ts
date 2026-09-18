import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditClip, TranscriptWord } from '@/types/models';
import { DEFAULT_PROJECT_VIEW } from '@/types/editor';
import { createInitialEdl, isSourceKept, outputDurationMs } from '@/lib/core/edl';
import { clipSpeedRanges } from '@/lib/core/clips';
import { defaultStyle } from '@/lib/storage/projectRepo';
import { createHistory } from '@/lib/core/undo';
import { useProjectStore } from './projectStore';

const word = (id: string, clipId: string, startMs: number, endMs: number, text: string): TranscriptWord => ({
  id, transcriptId: 't', idx: Number(id.slice(1)), startMs, endMs, text, isFiller: false, clipId, deleted: false,
});

const clip = (id: string, idx: number, startMs: number, endMs: number, text: string): EditClip => ({
  id, projectId: 'p', idx, sourceKind: 'video-edit', sourceStartMs: startMs, sourceEndMs: endMs,
  captionText: text, captionTextOriginal: text, captionEdited: false, enabled: true, speed: 1,
});

function seed() {
  useProjectStore.setState({
    status: 'ready',
    project: { id: 'p', name: 'p', durationMs: 4000, sourceDurationMs: 4000, width: 1920, height: 1080, fps: 30, status: 'editing', createdAt: 0, updatedAt: 0, schemaVersion: 2, ...DEFAULT_PROJECT_VIEW, pipelineStage: 2, sourceTool: 'import' },
    doc: {
      edl: createInitialEdl('p', 'a', 4000, 0, () => 'seg'),
      clips: [clip('c1', 0, 0, 1000, '하나 둘'), clip('c2', 1, 2000, 3000, '셋 넷')],
      words: [word('w0', 'c1', 0, 400, '하나'), word('w1', 'c1', 500, 1000, '둘'), word('w2', 'c2', 2000, 2400, '셋'), word('w3', 'c2', 2500, 3000, '넷')],
      style: defaultStyle('p'),
      tracks: [],
      view: { ...DEFAULT_PROJECT_VIEW },
    },
    history: createHistory(),
    suggestions: [],
  });
}

beforeEach(() => {
  vi.useFakeTimers(); // 800ms 뒤 자동 저장이 IndexedDB를 건드리지 않게
  seed();
});
afterEach(() => vi.useRealTimers());

describe('단어 지우기', () => {
  it('자막 줄이 줄고, 그 구간이 영상에서 빠지고, 되돌리면 원래대로', () => {
    const before = outputDurationMs(useProjectStore.getState().doc.edl);
    useProjectStore.getState().deleteWord('w0');

    const after = useProjectStore.getState().doc;
    expect(after.clips[0].captionText).toBe('둘');
    expect(after.words[0].deleted).toBe(true);
    expect(isSourceKept(200, after.edl)).toBe(false);
    expect(outputDurationMs(after.edl)).toBeLessThan(before);

    expect(useProjectStore.getState().undo()).toBe('단어 지우기');
    const back = useProjectStore.getState().doc;
    expect(back.clips[0].captionText).toBe('하나 둘');
    expect(back.words[0].deleted).toBe(false);
    expect(isSourceKept(200, back.edl)).toBe(true);
    expect(outputDurationMs(back.edl)).toBe(before);
  });

  it('클립의 모든 단어를 지우면 클립이 꺼진다', () => {
    useProjectStore.getState().deleteWord('w0');
    useProjectStore.getState().deleteWord('w1');
    expect(useProjectStore.getState().doc.clips[0].enabled).toBe(false);
  });

  it('직접 고친 자막은 단어를 지워도 덮어쓰지 않는다', () => {
    useProjectStore.getState().setCaption('c1', '내가 쓴 자막');
    useProjectStore.getState().deleteWord('w0');
    expect(useProjectStore.getState().doc.clips[0].captionText).toBe('내가 쓴 자막');
    useProjectStore.getState().resetCaption('c1');
    expect(useProjectStore.getState().doc.clips[0].captionText).toBe('둘');
  });
});

describe('클립 삭제·복원', () => {
  it('클립을 빼면 그 구간이 빠지고 되살리면 돌아온다', () => {
    useProjectStore.getState().removeClips(['c2']);
    expect(isSourceKept(2500, useProjectStore.getState().doc.edl)).toBe(false);
    expect(useProjectStore.getState().doc.clips[1].enabled).toBe(false);

    useProjectStore.getState().setClipEnabled('c2', true);
    expect(isSourceKept(2500, useProjectStore.getState().doc.edl)).toBe(true);
    expect(useProjectStore.getState().doc.clips[1].enabled).toBe(true);
  });
});

describe('서식 적용 범위 (F-03)', () => {
  it('영상 전체는 공용 서식을 바꾸고 클립별 예외를 지운다', () => {
    useProjectStore.getState().setClipStyle(['c1'], { color: '#FF0000' });
    expect(useProjectStore.getState().doc.clips[0].styleOverride).toEqual({ color: '#FF0000' });

    useProjectStore.getState().setClipStyle('all', { fontFamily: 'serif' });
    const doc = useProjectStore.getState().doc;
    expect(doc.style.fontFamily).toBe('serif');
    expect(doc.clips.every((c) => c.styleOverride === undefined)).toBe(true);
  });

  it('선택 클립만 바꾸면 나머지는 그대로', () => {
    useProjectStore.getState().setClipStyle(['c2'], { color: '#00FF00', bgEnabled: true });
    const doc = useProjectStore.getState().doc;
    expect(doc.clips[0].styleOverride).toBeUndefined();
    expect(doc.clips[1].styleOverride).toEqual({ color: '#00FF00', bgEnabled: true });
    expect(doc.style.color).toBe(defaultStyle('p').color);
  });
});

describe('배속 (F-05)', () => {
  it('영상 전체 배속은 결과 길이를 그만큼 줄인다', () => {
    useProjectStore.getState().setClipSpeed('all', 2);
    const doc = useProjectStore.getState().doc;
    expect(doc.view.globalSpeed).toBe(2);
    expect(doc.clips.every((c) => c.speed === 2)).toBe(true);
    expect(outputDurationMs(doc.edl, clipSpeedRanges(doc.clips), doc.view.globalSpeed)).toBe(2000);
  });

  it('클립 하나만 1.5배 — 그 클립 구간만 짧아진다', () => {
    useProjectStore.getState().setClipSpeed(['c1'], 1.5);
    const doc = useProjectStore.getState().doc;
    expect(doc.clips.map((c) => c.speed)).toEqual([1.5, 1]);
    // 0~1000ms가 1.5배 → 667ms, 나머지 3000ms는 그대로
    expect(outputDurationMs(doc.edl, clipSpeedRanges(doc.clips), 1)).toBe(3667);
  });

  it('범위를 벗어난 값은 0.25~4로 맞춘다', () => {
    useProjectStore.getState().setClipSpeed('all', 99);
    expect(useProjectStore.getState().doc.view.globalSpeed).toBe(4);
  });
});
