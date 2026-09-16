// 되돌리기 스택. 전체 상태 스냅샷 대신 immer 패치(정방향/역방향)만 저장해서
// 모자이크 키프레임처럼 큰 배열이 있어도 20단계 기록 메모리가 작게 유지된다.
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';

enablePatches();

export const UNDO_LIMIT = 20;

export interface UndoEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface UndoHistory {
  past: UndoEntry[];
  future: UndoEntry[];
  limit: number;
}

export function createHistory(limit = UNDO_LIMIT): UndoHistory {
  return { past: [], future: [], limit };
}

export interface Transition<T> {
  state: T;
  history: UndoHistory;
}

/** 상태를 바꾸고 기록한다. 실제 변화가 없으면 기록하지 않는다(빈 undo 단계 방지). */
export function commit<T extends object>(
  state: T, history: UndoHistory, label: string, recipe: (draft: Draft<T>) => void,
): Transition<T> {
  const [next, patches, inverse] = produceWithPatches(state, recipe);
  if (patches.length === 0) return { state, history };
  const past = [...history.past, { label, patches, inverse }];
  if (past.length > history.limit) past.splice(0, past.length - history.limit);
  return { state: next as T, history: { ...history, past, future: [] } };
}

export function undo<T extends object>(state: T, history: UndoHistory): Transition<T> & { entry?: UndoEntry } {
  const entry = history.past[history.past.length - 1];
  if (!entry) return { state, history };
  return {
    state: applyPatches(state, entry.inverse),
    history: { ...history, past: history.past.slice(0, -1), future: [entry, ...history.future] },
    entry,
  };
}

export function redo<T extends object>(state: T, history: UndoHistory): Transition<T> & { entry?: UndoEntry } {
  const entry = history.future[0];
  if (!entry) return { state, history };
  return {
    state: applyPatches(state, entry.patches),
    history: { ...history, past: [...history.past, entry], future: history.future.slice(1) },
    entry,
  };
}

export const canUndo = (h: UndoHistory) => h.past.length > 0;
export const canRedo = (h: UndoHistory) => h.future.length > 0;
