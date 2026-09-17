// EDL(Edit Decision List) 순수 함수 모음. 원본은 절대 건드리지 않고, "어느 원본 구간을 남길지"만 표현한다.
// 모든 함수는 입력 배열을 변경하지 않고 새 배열을 돌려준다(undo 패치·React 비교가 참조 동등성에 의존하기 때문).
//
// ⚠️ v2 시간 계산 순서: 원본시간 → [EDL 적용] → [배속 적용] → 출력시간.
// 이 파일의 createTimeMap이 유일한 진실이고, sourceToOutput/outputToSource는 그 위에 있는 얇은 껍데기다.
import { nanoid } from 'nanoid';
import type { CutSuggestion, EdlOrigin, EdlSegment, TimeRange } from '@/types/models';

export type IdGen = () => string;
const defaultId: IdGen = () => nanoid(10);

export function createInitialEdl(
  projectId: string, assetId: string, durationMs: number, now = 0, idGen: IdGen = defaultId,
): EdlSegment[] {
  return [{
    id: idGen(), projectId, assetId, order: 0,
    sourceStartMs: 0, sourceEndMs: Math.max(0, Math.round(durationMs)),
    enabled: true, origin: 'initial', updatedAt: now,
  }];
}

export function sortSegments(edl: readonly EdlSegment[]): EdlSegment[] {
  return [...edl].sort((a, b) => a.order - b.order);
}

function renumber(segs: EdlSegment[]): EdlSegment[] {
  return segs
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs)
    .map((s, i) => (s.order === i ? s : { ...s, order: i }));
}

function enabledSorted(edl: readonly EdlSegment[]): EdlSegment[] {
  return sortSegments(edl).filter((s) => s.enabled && s.sourceEndMs > s.sourceStartMs);
}

export function sourceDurationMs(edl: readonly EdlSegment[]): number {
  return edl.reduce((max, s) => Math.max(max, s.sourceEndMs), 0);
}

export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((r) => r.endMs > r.startMs).sort((a, b) => a.startMs - b.startMs);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMs <= last.endMs) last.endMs = Math.max(last.endMs, r.endMs);
    else out.push({ startMs: r.startMs, endMs: r.endMs });
  }
  return out;
}

/** 내보내기에 들어갈 원본 구간(맞닿은 구간은 하나로 합침). */
export function keptRanges(edl: readonly EdlSegment[]): TimeRange[] {
  return mergeRanges(enabledSorted(edl).map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })));
}

export function removedRanges(edl: readonly EdlSegment[]): TimeRange[] {
  return mergeRanges(sortSegments(edl).filter((s) => !s.enabled).map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })));
}

// ── 시간 매핑 (EDL → 배속) ──────────────────────────────────────────────────

/** 구간별 재생 속도. 겹치지 않는 원본 구간이어야 한다 */
export interface SpeedRange extends TimeRange {
  speed: number;
}

export interface TimeSpan {
  sourceStartMs: number;
  sourceEndMs: number;
  speed: number;
  outStartMs: number;
  outEndMs: number;
}

export interface TimeMap {
  spans: TimeSpan[];
  totalOutMs: number;
  /** 원본 시간 → 결과물 시간. 잘려나간 구간이면 null */
  toOutput(sourceMs: number): number | null;
  /** 결과물 시간 → 원본 시간. 경계는 bias로 어느 쪽을 택할지 정한다 */
  toSource(outputMs: number, bias?: 'start' | 'end'): number | null;
  speedAt(sourceMs: number): number;
}

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export function normalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) * 100) / 100;
}

function speedLookup(speeds: readonly SpeedRange[], ms: number, fallback: number): number {
  for (const s of speeds) {
    if (ms >= s.startMs && ms < s.endMs) return normalizeSpeed(s.speed);
  }
  return normalizeSpeed(fallback);
}

/** ms 이후 처음 만나는 배속 경계 (없으면 Infinity) */
function nextSpeedBoundary(speeds: readonly SpeedRange[], ms: number): number {
  let next = Infinity;
  for (const s of speeds) {
    if (s.startMs > ms && s.startMs < next) next = s.startMs;
    if (s.endMs > ms && s.endMs < next) next = s.endMs;
  }
  return next;
}

/**
 * EDL(남길 구간)과 배속을 합쳐 "원본 ↔ 결과물" 변환표를 만든다.
 * 프레임마다 호출되는 렌더 루프에서는 이 표를 한 번 만들어 재사용한다.
 */
export function createTimeMap(edl: readonly EdlSegment[], speeds: readonly SpeedRange[] = [], defaultSpeed = 1): TimeMap {
  const base = normalizeSpeed(defaultSpeed);
  const active = speeds.filter((s) => s.endMs > s.startMs);
  const spans: TimeSpan[] = [];
  let out = 0;
  for (const range of keptRanges(edl)) {
    let pos = range.startMs;
    while (pos < range.endMs) {
      const speed = speedLookup(active, pos, base);
      const end = Math.min(range.endMs, nextSpeedBoundary(active, pos));
      const len = end - pos;
      spans.push({ sourceStartMs: pos, sourceEndMs: end, speed, outStartMs: out, outEndMs: out + len / speed });
      out += len / speed;
      pos = end;
    }
  }

  const findBySource = (ms: number): TimeSpan | undefined => {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = spans[mid];
      if (ms < s.sourceStartMs) hi = mid - 1;
      else if (ms > s.sourceEndMs) lo = mid + 1;
      else return s;
    }
    return undefined;
  };

  return {
    spans,
    totalOutMs: Math.round(out),
    speedAt: (ms) => findBySource(ms)?.speed ?? speedLookup(active, ms, base),
    toOutput(sourceMs) {
      const span = findBySource(sourceMs);
      if (!span) return null;
      return Math.round(span.outStartMs + (sourceMs - span.sourceStartMs) / span.speed);
    },
    toSource(outputMs, bias = 'start') {
      if (outputMs < 0 || spans.length === 0) return null;
      if (outputMs > out + 0.5) return null;
      for (let i = 0; i < spans.length; i++) {
        const s = spans[i];
        const inside = bias === 'start' ? outputMs < s.outEndMs : outputMs <= s.outEndMs && outputMs > s.outStartMs;
        if (inside || (i === spans.length - 1 && outputMs >= s.outEndMs)) {
          const clamped = Math.min(Math.max(outputMs, s.outStartMs), s.outEndMs);
          return Math.round(s.sourceStartMs + (clamped - s.outStartMs) * s.speed);
        }
      }
      return null;
    },
  };
}

/** 원본 시간 → 결과물 시간. 잘려나간 구간이면 null. (ERD 6.3 + v2 배속) */
export function sourceToOutput(sourceMs: number, edl: readonly EdlSegment[], speeds: readonly SpeedRange[] = [], defaultSpeed = 1): number | null {
  return createTimeMap(edl, speeds, defaultSpeed).toOutput(sourceMs);
}

/**
 * 결과물 시간 → 원본 시간. 범위 밖이면 null.
 * 두 구간이 맞닿는 경계는 원본에서 두 지점에 대응하므로, bias로 어느 쪽을 택할지 정한다
 * (자막 시작은 다음 구간의 시작, 자막 끝은 이전 구간의 끝이 자연스럽다).
 */
export function outputToSource(
  outputMs: number, edl: readonly EdlSegment[], bias: 'start' | 'end' = 'start', speeds: readonly SpeedRange[] = [], defaultSpeed = 1,
): number | null {
  return createTimeMap(edl, speeds, defaultSpeed).toSource(outputMs, bias);
}

export function outputDurationMs(edl: readonly EdlSegment[], speeds: readonly SpeedRange[] = [], defaultSpeed = 1): number {
  if (speeds.length === 0 && defaultSpeed === 1) {
    return enabledSorted(edl).reduce((acc, s) => acc + (s.sourceEndMs - s.sourceStartMs), 0);
  }
  return createTimeMap(edl, speeds, defaultSpeed).totalOutMs;
}

// ── 조회 ────────────────────────────────────────────────────────────────────

export function segmentAt(edl: readonly EdlSegment[], sourceMs: number): EdlSegment | undefined {
  return sortSegments(edl).find((s) => sourceMs >= s.sourceStartMs && sourceMs < s.sourceEndMs);
}

export function isSourceKept(sourceMs: number, edl: readonly EdlSegment[]): boolean {
  return segmentAt(edl, sourceMs)?.enabled === true;
}

/** sourceMs 이후(포함) 처음 나오는 유지 지점. 재생 중 잘린 구간을 건너뛸 때 쓴다. */
export function nextKeptSourceMs(sourceMs: number, edl: readonly EdlSegment[]): number | null {
  for (const seg of enabledSorted(edl)) {
    if (sourceMs < seg.sourceEndMs) return Math.max(sourceMs, seg.sourceStartMs);
  }
  return null;
}

/** sourceMs 이전(포함) 마지막 유지 지점. */
export function prevKeptSourceMs(sourceMs: number, edl: readonly EdlSegment[]): number | null {
  const segs = enabledSorted(edl).reverse();
  for (const seg of segs) {
    if (sourceMs > seg.sourceStartMs) return Math.min(sourceMs, seg.sourceEndMs);
  }
  return null;
}

// ── 편집 ────────────────────────────────────────────────────────────────────

function splitInternal(
  edl: readonly EdlSegment[], sourceMs: number, rightOrigin: EdlOrigin | null, idGen: IdGen, now: number,
): EdlSegment[] {
  const ms = Math.round(sourceMs);
  const target = edl.find((s) => ms > s.sourceStartMs && ms < s.sourceEndMs);
  if (!target) return edl as EdlSegment[];
  const left: EdlSegment = { ...target, sourceEndMs: ms, updatedAt: now };
  const right: EdlSegment = {
    ...target, id: idGen(), sourceStartMs: ms, origin: rightOrigin ?? target.origin, updatedAt: now,
  };
  return renumber([...edl.filter((s) => s !== target), left, right]);
}

/** 재생헤드 위치에서 구간을 둘로 나눈다. 구간 내부가 아니면(경계·범위 밖) 그대로 돌려준다. */
export function splitAt(edl: readonly EdlSegment[], sourceMs: number, idGen: IdGen = defaultId, now = 0): EdlSegment[] {
  return splitInternal(edl, sourceMs, 'manual-split', idGen, now);
}

export function toggleSegment(edl: readonly EdlSegment[], id: string, now = 0): EdlSegment[] {
  if (!edl.some((s) => s.id === id)) return edl as EdlSegment[];
  return edl.map((s) => (s.id === id ? { ...s, enabled: !s.enabled, updatedAt: now } : s));
}

export function setSegmentEnabled(edl: readonly EdlSegment[], id: string, enabled: boolean, now = 0): EdlSegment[] {
  return edl.map((s) => (s.id === id && s.enabled !== enabled ? { ...s, enabled, updatedAt: now } : s));
}

/** 승인된 제안 구간을 잘라내 EDL에 반영한다. 파일은 자르지 않는다 — 실제 렌더는 내보내기 때 한 번. */
export function applySuggestions(
  edl: readonly EdlSegment[],
  accepted: readonly Pick<CutSuggestion, 'startMs' | 'endMs' | 'source'>[],
  idGen: IdGen = defaultId,
  now = 0,
): EdlSegment[] {
  let out = edl as EdlSegment[];
  const sorted = [...accepted].sort((a, b) => a.startMs - b.startMs);
  for (const cut of sorted) {
    const start = Math.round(cut.startMs);
    const end = Math.round(cut.endMs);
    if (end <= start) continue;
    out = splitInternal(out, start, null, idGen, now);
    out = splitInternal(out, end, null, idGen, now);
    const origin: EdlOrigin = cut.source === 'filler' ? 'auto-filler' : 'auto-silence';
    out = out.map((s) => (s.sourceStartMs >= start && s.sourceEndMs <= end && s.enabled
      ? { ...s, enabled: false, origin, updatedAt: now }
      : s));
  }
  return out;
}

/** 특정 구간 안에서 잘라냈던 것을 되살린다 (단어 칩 되돌리기 F-01-3에서 쓴다) */
export function restoreRange(edl: readonly EdlSegment[], range: TimeRange, now = 0): EdlSegment[] {
  const start = Math.round(range.startMs);
  const end = Math.round(range.endMs);
  if (end <= start) return edl as EdlSegment[];
  let changed = false;
  const out = edl.map((s) => {
    if (s.enabled || s.sourceStartMs >= end || s.sourceEndMs <= start) return s;
    changed = true;
    return { ...s, enabled: true, updatedAt: now };
  });
  return changed ? out : (edl as EdlSegment[]);
}

const isAuto = (o: EdlOrigin) => o === 'auto-silence' || o === 'auto-filler';

/** 자동 컷만 전부 되돌린다. 수동으로 끈 구간과 수동 분할점은 유지한다. */
export function revertAuto(edl: readonly EdlSegment[], now = 0): EdlSegment[] {
  const items = sortSegments(edl).map((s) => ({
    seg: isAuto(s.origin) ? { ...s, enabled: true, updatedAt: now } : s,
    auto: isAuto(s.origin),
  }));
  const merged: { seg: EdlSegment; auto: boolean }[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    if (last && last.seg.enabled && item.seg.enabled && (last.auto || item.auto)
      && last.seg.sourceEndMs === item.seg.sourceStartMs) {
      const origin = isAuto(last.seg.origin) ? (isAuto(item.seg.origin) ? 'initial' : item.seg.origin) : last.seg.origin;
      last.seg = { ...last.seg, sourceEndMs: item.seg.sourceEndMs, origin, updatedAt: now };
      last.auto = true;
    } else {
      merged.push({ ...item });
    }
  }
  return renumber(merged.map((m) => (isAuto(m.seg.origin) ? { ...m.seg, origin: 'initial' as const } : m.seg)));
}

/**
 * 맞닿은 두 구간의 경계를 옮긴다(컷 경계 1프레임 미세 조정용).
 * 어느 구간도 minLenMs보다 짧아지지 않게 제한한다.
 */
export function moveBoundary(
  edl: readonly EdlSegment[], leftId: string, newMs: number, minLenMs = 1, now = 0,
): EdlSegment[] {
  const sorted = sortSegments(edl);
  const idx = sorted.findIndex((s) => s.id === leftId);
  const left = sorted[idx];
  const right = sorted[idx + 1];
  if (!left || !right || left.sourceEndMs !== right.sourceStartMs) return edl as EdlSegment[];
  const clamped = Math.round(Math.min(Math.max(newMs, left.sourceStartMs + minLenMs), right.sourceEndMs - minLenMs));
  if (clamped === left.sourceEndMs) return edl as EdlSegment[];
  return edl.map((s) => {
    if (s.id === left.id) return { ...s, sourceEndMs: clamped, updatedAt: now };
    if (s.id === right.id) return { ...s, sourceStartMs: clamped, updatedAt: now };
    return s;
  });
}
