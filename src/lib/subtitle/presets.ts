// 자막 스타일 프리셋: 기본 4종(코드 상수) + 사용자 프리셋(IndexedDB). 로그인하면 Firestore와 동기화한다(src/lib/firebase/sync.ts).
import { nanoid } from 'nanoid';
import type { StylePresetRecord, StyleValues } from '@/types/models';
import { getDb } from '@/lib/storage/db';
import { DEFAULT_STYLE_VALUES } from './model';

const base = DEFAULT_STYLE_VALUES;

export const BUILT_IN_PRESETS: StylePresetRecord[] = [
  { id: 'builtin-youtube', name: '유튜브 기본', builtIn: true, updatedAt: 0, style: { ...base } },
  {
    id: 'builtin-variety', name: '굵은 예능자막', builtIn: true, updatedAt: 0,
    style: { ...base, fontSize: 84, fontWeight: 900, color: '#FFE14D', outlineColor: '#1A1A1A', outlineWidth: 10, shadowBlur: 8, marginBottom: 90, maxCharsPerLine: 16 },
  },
  {
    id: 'builtin-minimal', name: '미니멀', builtIn: true, updatedAt: 0,
    style: { ...base, fontSize: 52, fontWeight: 500, outlineWidth: 0, shadowBlur: 0, bgColor: '#000000', bgOpacity: 0.55, bgPaddingX: 28, bgPaddingY: 12, bgRadius: 10 },
  },
  {
    id: 'builtin-bright', name: '밝은 배경용', builtIn: true, updatedAt: 0,
    style: { ...base, fontWeight: 800, color: '#111111', outlineColor: '#FFFFFF', outlineWidth: 6, shadowBlur: 0 },
  },
];

export async function listPresets(): Promise<StylePresetRecord[]> {
  const mine = await getDb().stylePresets.orderBy('updatedAt').reverse().toArray();
  return [...BUILT_IN_PRESETS, ...mine];
}

export async function savePreset(name: string, style: StyleValues): Promise<StylePresetRecord> {
  const record: StylePresetRecord = { id: `preset-${nanoid(8)}`, name: name.trim() || '내 프리셋', style: { ...style }, builtIn: false, updatedAt: Date.now() };
  await getDb().stylePresets.put(record);
  return record;
}

export async function deletePreset(id: string): Promise<void> {
  await getDb().stylePresets.delete(id);
}

/** 프로젝트 스타일에서 id/projectId를 뗀 순수 스타일 값 */
export function styleValuesOf<T extends StyleValues>(style: T): StyleValues {
  const values = { ...DEFAULT_STYLE_VALUES };
  (Object.keys(values) as (keyof StyleValues)[]).forEach((k) => {
    (values as Record<string, unknown>)[k] = style[k];
  });
  return values;
}
