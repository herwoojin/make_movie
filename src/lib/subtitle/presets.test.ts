import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_VALUES } from './model';
import { BUILT_IN_PRESETS, deletePreset, listPresets, savePreset, styleValuesOf } from './presets';

describe('자막 스타일 프리셋', () => {
  it('기본 프리셋 4종', () => {
    expect(BUILT_IN_PRESETS.map((p) => p.name)).toEqual(['유튜브 기본', '굵은 예능자막', '미니멀', '밝은 배경용']);
    expect(BUILT_IN_PRESETS.every((p) => p.builtIn)).toBe(true);
  });

  it('저장 → 목록(기본 뒤에 최신순) → 삭제', async () => {
    const a = await savePreset('  내 강의용  ', { ...DEFAULT_STYLE_VALUES, fontSize: 70 });
    await new Promise((r) => setTimeout(r, 2));
    const b = await savePreset('', DEFAULT_STYLE_VALUES);
    expect(a.name).toBe('내 강의용');
    expect(b.name).toBe('내 프리셋');
    const list = await listPresets();
    expect(list.slice(0, 4).map((p) => p.id)).toEqual(BUILT_IN_PRESETS.map((p) => p.id));
    expect(list.slice(4).map((p) => p.id)).toEqual([b.id, a.id]);
    expect(list.find((p) => p.id === a.id)?.style.fontSize).toBe(70);
    await deletePreset(a.id);
    expect((await listPresets()).some((p) => p.id === a.id)).toBe(false);
  });

  it('styleValuesOf는 id·projectId를 떼어낸다', () => {
    const values = styleValuesOf({ ...DEFAULT_STYLE_VALUES, id: 'style-p', projectId: 'p', color: '#123456' });
    expect(values).not.toHaveProperty('id');
    expect(values).not.toHaveProperty('projectId');
    expect(values.color).toBe('#123456');
  });
});
