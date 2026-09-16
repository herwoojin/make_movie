import { describe, expect, it } from 'vitest';
import type { StylePresetRecord } from '@/types/models';
import { DEFAULT_STYLE_VALUES } from '@/lib/subtitle/model';
import {
  decideFillerSync, docToPreset, parseFillerDoc, parseProjectMetaDoc, planPresetSync, presetToDoc, projectToMetaDoc, sanitizeStyle,
} from './schema';

const preset = (id: string, updatedAt: number, extra: Partial<StylePresetRecord> = {}): StylePresetRecord => ({
  id, name: id, style: { ...DEFAULT_STYLE_VALUES }, builtIn: false, updatedAt, ...extra,
});
const remoteDoc = (name: string, updatedAtMs: number) => ({ name, style: { ...DEFAULT_STYLE_VALUES }, isPublic: false, updatedAtMs, schemaVersion: 1 });

describe('sanitizeStyle', () => {
  it('타입이 틀리거나 허용되지 않은 값은 기본값, 모르는 필드는 버림', () => {
    const s = sanitizeStyle({ fontSize: '99', color: '#FF0000', alignment: 'justify', verticalPosition: 'top', maxLines: Infinity, hack: 1 });
    expect(s.fontSize).toBe(DEFAULT_STYLE_VALUES.fontSize);
    expect(s.color).toBe('#FF0000');
    expect(s.alignment).toBe('center');
    expect(s.verticalPosition).toBe('top');
    expect(s.maxLines).toBe(DEFAULT_STYLE_VALUES.maxLines);
    expect(s).not.toHaveProperty('hack');
  });
  it('객체가 아니면 기본 스타일', () => {
    expect(sanitizeStyle(null)).toEqual(DEFAULT_STYLE_VALUES);
    expect(sanitizeStyle([1, 2])).toEqual(DEFAULT_STYLE_VALUES);
  });
});

describe('프리셋 문서 변환', () => {
  it('presetToDoc ↔ docToPreset 왕복, 이름 길이 제한', () => {
    const p = preset('p1', 100, { name: 'x'.repeat(80) });
    const doc = presetToDoc(p, true);
    expect(doc).toMatchObject({ isPublic: true, updatedAtMs: 100, schemaVersion: 1 });
    expect(doc.name).toHaveLength(60);
    expect(docToPreset('r1', doc)).toMatchObject({ id: 'preset-r-r1', remoteId: 'r1', updatedAt: 100, builtIn: false });
    expect(docToPreset('r1', doc, 'local-id')?.id).toBe('local-id');
  });
  it('깨진 문서는 null', () => {
    expect(docToPreset('r', { name: '', updatedAtMs: 1 })).toBeNull();
    expect(docToPreset('r', { name: 'a' })).toBeNull();
    expect(docToPreset('r', 'nope')).toBeNull();
  });
});

describe('planPresetSync', () => {
  it('처음 로그인: 로컬 프리셋은 올리고, 서버에만 있는 것은 받는다. 기본 프리셋은 제외', () => {
    const plan = planPresetSync(
      [preset('a', 10), preset('builtin', 0, { builtIn: true })],
      [{ id: 'r1', data: remoteDoc('서버', 5) }],
    );
    expect(plan.push.map((p) => p.id)).toEqual(['a']);
    expect(plan.pull.map((p) => p.remoteId)).toEqual(['r1']);
  });
  it('양쪽에 있으면 더 최근 것이 이긴다', () => {
    const local = [preset('a', 10, { remoteId: 'ra' }), preset('b', 50, { remoteId: 'rb' }), preset('c', 7, { remoteId: 'rc' })];
    const plan = planPresetSync(local, [
      { id: 'ra', data: remoteDoc('서버가 최신', 20) },
      { id: 'rb', data: remoteDoc('로컬이 최신', 30) },
      { id: 'rc', data: remoteDoc('같음', 7) },
    ]);
    expect(plan.pull).toHaveLength(1);
    expect(plan.pull[0]).toMatchObject({ id: 'a', name: '서버가 최신', updatedAt: 20 });
    expect(plan.push.map((p) => p.id)).toEqual(['b']);
  });
  it('서버에서 사라졌거나 서버 문서가 깨졌으면 로컬 것을 다시 올린다', () => {
    const local = [preset('a', 10, { remoteId: 'gone' }), preset('b', 10, { remoteId: 'broken' })];
    const plan = planPresetSync(local, [{ id: 'broken', data: { name: 1 } }]);
    expect(plan.push.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(plan.pull).toEqual([]);
  });
});

describe('추임새 사전', () => {
  it('parseFillerDoc: 잘못된 항목은 버리고 개수 제한', () => {
    const doc = parseFillerDoc({ updatedAtMs: 5, words: [{ word: ' 음 ', enabled: true }, { word: '', enabled: true }, { word: 'x', enabled: 'yes' }, 3] });
    expect(doc).toEqual({ language: 'ko', words: [{ word: '음', enabled: true }], updatedAtMs: 5 });
    expect(parseFillerDoc({ words: [] })).toBeNull();
    const many = parseFillerDoc({ updatedAtMs: 1, language: 'en', words: Array.from({ length: 600 }, (_, i) => ({ word: `w${i}`, enabled: true })) });
    expect(many?.words).toHaveLength(500);
    expect(many?.language).toBe('en');
  });
  it('decideFillerSync', () => {
    expect(decideFillerSync(10, null)).toBe('push');
    expect(decideFillerSync(10, { language: 'ko', words: [], updatedAtMs: 20 })).toBe('pull');
    expect(decideFillerSync(30, { language: 'ko', words: [], updatedAtMs: 20 })).toBe('push');
    expect(decideFillerSync(20, { language: 'ko', words: [], updatedAtMs: 20 })).toBe('same');
  });
});

describe('프로젝트 기록', () => {
  it('영상 없이 이름·길이·기기만 담는다', () => {
    const doc = projectToMetaDoc({ id: 'p1', name: '강의 1화', durationMs: 1000.6, sourceDurationMs: -5, updatedAt: 9 }, 'Mac · Chrome');
    expect(doc).toEqual({ localId: 'p1', name: '강의 1화', durationMs: 1001, sourceDurationMs: 0, deviceLabel: 'Mac · Chrome', updatedAtMs: 9 });
    expect(parseProjectMetaDoc(doc)).toEqual(doc);
    expect(parseProjectMetaDoc({ ...doc, durationMs: 'x' })).toBeNull();
    expect(parseProjectMetaDoc({ ...doc, deviceLabel: 3 })?.deviceLabel).toBe('');
  });
});
