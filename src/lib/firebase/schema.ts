// Firestore 문서 구조와 동기화 판단 (순수 함수). 원격 데이터는 다른 기기·옛 버전·조작된 값일 수 있으므로
// 읽을 때 반드시 여기서 검증한다. 영상·오디오·자막 내용은 어떤 문서에도 들어가지 않는다.
//
// users/{uid}                                  프로필
// users/{uid}/stylePresets/{presetId}          자막 스타일 프리셋
// users/{uid}/fillerDictionaries/{language}    추임새 사전
// users/{uid}/projectMeta/{localProjectId}     "이 기기에 이런 프로젝트가 있었다" 기록 (영상 없음)
import type { FillerEntry } from '@/lib/stt/fillers';
import { DEFAULT_STYLE_VALUES } from '@/lib/subtitle/model';
import type { Project, StylePresetRecord, StyleValues } from '@/types/models';

export const PRESET_SCHEMA_VERSION = 1;
export const MAX_FILLER_WORDS = 500;
export const MAX_PRESET_NAME = 60;
export const MAX_PROJECT_NAME = 200;

export interface PresetDoc {
  name: string;
  style: StyleValues;
  isPublic: boolean;
  updatedAtMs: number;
  schemaVersion: number;
}

export interface FillerDoc {
  language: string;
  words: FillerEntry[];
  updatedAtMs: number;
}

export interface ProjectMetaDoc {
  localId: string;
  name: string;
  durationMs: number;
  sourceDurationMs: number;
  deviceLabel: string;
  updatedAtMs: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const ENUMS: Partial<Record<keyof StyleValues, readonly string[]>> = {
  alignment: ['left', 'center', 'right'],
  verticalPosition: ['top', 'middle', 'bottom'],
};

/** 필드마다 타입을 확인하고, 틀린 값은 기본값으로 대체한다 (알 수 없는 필드는 버림) */
export function sanitizeStyle(input: unknown): StyleValues {
  const out: StyleValues = { ...DEFAULT_STYLE_VALUES };
  if (!isObj(input)) return out;
  for (const key of Object.keys(out) as (keyof StyleValues)[]) {
    const value = input[key];
    const fallback = out[key];
    if (typeof value !== typeof fallback) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(value as string)) continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function presetToDoc(p: StylePresetRecord, isPublic = false): PresetDoc {
  return { name: p.name.slice(0, MAX_PRESET_NAME), style: sanitizeStyle(p.style), isPublic, updatedAtMs: p.updatedAt, schemaVersion: PRESET_SCHEMA_VERSION };
}

export function docToPreset(remoteId: string, data: unknown, localId?: string): StylePresetRecord | null {
  if (!isObj(data) || typeof data.name !== 'string' || !data.name.trim() || !finite(data.updatedAtMs)) return null;
  return {
    id: localId ?? `preset-r-${remoteId}`,
    name: data.name.slice(0, MAX_PRESET_NAME),
    style: sanitizeStyle(data.style),
    builtIn: false,
    remoteId,
    updatedAt: data.updatedAtMs,
  };
}

export interface RemoteDoc {
  id: string;
  data: unknown;
}

export interface PresetSyncPlan {
  /** 로컬에 새로 넣거나 덮어쓸 것 */
  pull: StylePresetRecord[];
  /** 서버에 올릴 것 (remoteId가 없으면 새 문서) */
  push: StylePresetRecord[];
}

/**
 * 최신 updatedAt이 이긴다. 서버에서 사라진 로컬 프리셋은 삭제 기록(묘비)이 없어 "지웠는지 유실됐는지" 알 수 없으므로
 * 데이터를 잃지 않는 쪽(다시 올리기)을 택한다. 다른 기기에서 지울 때는 서버 문서도 함께 지운다.
 */
export function planPresetSync(local: readonly StylePresetRecord[], remote: readonly RemoteDoc[]): PresetSyncPlan {
  const mine = local.filter((p) => !p.builtIn);
  const byRemoteId = new Map(mine.filter((p) => p.remoteId).map((p) => [p.remoteId as string, p]));
  const seen = new Set<string>();
  const pull: StylePresetRecord[] = [];
  const push: StylePresetRecord[] = [];

  for (const r of remote) {
    const match = byRemoteId.get(r.id);
    const parsed = docToPreset(r.id, r.data, match?.id);
    if (!parsed) continue;
    seen.add(r.id);
    if (!match || parsed.updatedAt > match.updatedAt) pull.push(parsed);
    else if (match.updatedAt > parsed.updatedAt) push.push(match);
  }
  for (const p of mine) {
    if (!p.remoteId || !seen.has(p.remoteId)) push.push(p);
  }
  return { pull, push };
}

export function parseFillerDoc(data: unknown): FillerDoc | null {
  if (!isObj(data) || !finite(data.updatedAtMs) || !Array.isArray(data.words)) return null;
  const words = data.words
    .filter((w): w is FillerEntry => isObj(w) && typeof w.word === 'string' && w.word.trim().length > 0 && w.word.length <= 20 && typeof w.enabled === 'boolean')
    .slice(0, MAX_FILLER_WORDS)
    .map((w) => ({ word: w.word.trim(), enabled: w.enabled }));
  return { language: typeof data.language === 'string' ? data.language : 'ko', words, updatedAtMs: data.updatedAtMs };
}

export function decideFillerSync(localUpdatedAt: number, remote: FillerDoc | null): 'push' | 'pull' | 'same' {
  if (!remote) return 'push';
  if (remote.updatedAtMs > localUpdatedAt) return 'pull';
  if (remote.updatedAtMs < localUpdatedAt) return 'push';
  return 'same';
}

export function projectToMetaDoc(p: Pick<Project, 'id' | 'name' | 'durationMs' | 'sourceDurationMs' | 'updatedAt'>, deviceLabel: string): ProjectMetaDoc {
  return {
    localId: p.id,
    name: p.name.slice(0, MAX_PROJECT_NAME),
    durationMs: Math.max(0, Math.round(p.durationMs)),
    sourceDurationMs: Math.max(0, Math.round(p.sourceDurationMs)),
    deviceLabel: deviceLabel.slice(0, 60),
    updatedAtMs: p.updatedAt,
  };
}

export function parseProjectMetaDoc(data: unknown): ProjectMetaDoc | null {
  if (!isObj(data) || typeof data.localId !== 'string' || typeof data.name !== 'string' || !finite(data.durationMs)
    || !finite(data.sourceDurationMs) || !finite(data.updatedAtMs)) return null;
  return {
    localId: data.localId,
    name: data.name.slice(0, MAX_PROJECT_NAME),
    durationMs: data.durationMs,
    sourceDurationMs: data.sourceDurationMs,
    deviceLabel: typeof data.deviceLabel === 'string' ? data.deviceLabel : '',
    updatedAtMs: data.updatedAtMs,
  };
}
