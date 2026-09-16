import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './undo';

interface Doc { items: number[]; name: string }

describe('undo', () => {
  it('commit → undo → redo 왕복', () => {
    let state: Doc = { items: [1], name: 'a' };
    let history = createHistory();
    ({ state, history } = commit(state, history, 'push', (d) => { d.items.push(2); }));
    ({ state, history } = commit(state, history, 'rename', (d) => { d.name = 'b'; }));
    expect(state).toEqual({ items: [1, 2], name: 'b' });
    expect(canUndo(history)).toBe(true);

    const u1 = undo(state, history);
    expect(u1.state).toEqual({ items: [1, 2], name: 'a' });
    expect(u1.entry?.label).toBe('rename');
    const u2 = undo(u1.state, u1.history);
    expect(u2.state).toEqual({ items: [1], name: 'a' });
    expect(canRedo(u2.history)).toBe(true);

    const r = redo(u2.state, u2.history);
    expect(r.state).toEqual({ items: [1, 2], name: 'a' });
  });

  it('변화 없는 commit은 기록하지 않는다', () => {
    const state: Doc = { items: [], name: 'a' };
    const history = createHistory();
    const t = commit(state, history, 'noop', () => {});
    expect(t.history.past).toHaveLength(0);
    expect(t.state).toBe(state);
  });

  it('새 commit은 redo 스택을 비운다', () => {
    let state: Doc = { items: [], name: 'a' };
    let history = createHistory();
    ({ state, history } = commit(state, history, '1', (d) => { d.name = 'b'; }));
    ({ state, history } = undo(state, history));
    ({ state, history } = commit(state, history, '2', (d) => { d.name = 'c'; }));
    expect(canRedo(history)).toBe(false);
  });

  it('최대 단계 수를 넘으면 오래된 것부터 버린다', () => {
    let state: Doc = { items: [], name: 'a' };
    let history = createHistory(3);
    for (let i = 0; i < 5; i++) ({ state, history } = commit(state, history, `${i}`, (d) => { d.items.push(i); }));
    expect(history.past.map((e) => e.label)).toEqual(['2', '3', '4']);
    for (let i = 0; i < 3; i++) ({ state, history } = undo(state, history));
    expect(state.items).toEqual([0, 1]);
  });

  it('빈 스택에서 undo/redo는 그대로', () => {
    const state: Doc = { items: [], name: 'a' };
    const history = createHistory();
    expect(undo(state, history).state).toBe(state);
    expect(redo(state, history).state).toBe(state);
  });
});
