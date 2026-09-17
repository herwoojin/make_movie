// v2 단어 칩 편집의 순수 로직 (F-01). DOM·React 의존 금지.
//
// 편집 단위는 EditClip(자막 한 줄)이고, 그 안의 TranscriptWord가 칩이다.
// 칩을 지우면 deleted 플래그만 세우고(원본 배열 보존), 그 구간을 EDL에서 잘라낸다.
import { nanoid } from 'nanoid';
import type { EdlSegment, EditClip, TimeRange, TranscriptWord } from '@/types/models';
import { applySuggestions, mergeRanges, restoreRange, type IdGen } from './edl';

/** 단어 앞뒤로 남길 여유 (TRD 4.3 추임새 규칙과 동일) */
export const WORD_PADDING_MS = 30;
/** 이 간격보다 가까운 삭제 구간은 하나로 합친다 (잘게 쪼개지면 소리가 끊긴다) */
export const MERGE_GAP_MS = 150;
export const CLIP_GAP_MS = 700;
export const CLIP_MAX_CHARS = 42;

const defaultId: IdGen = () => nanoid(10);
const SENTENCE_END = /[.?!。？！…]$/;

export interface ClipState {
  clips: EditClip[];
  words: TranscriptWord[];
}

export interface BuildClipsOptions {
  projectId: string;
  maxChars?: number;
  gapMs?: number;
  sourceKind?: EditClip['sourceKind'];
  speed?: number;
  idGen?: IdGen;
}

/** 단어 배열 → 클립(자막 한 줄). 문장부호 / 0.7초 이상 간격 / 글자 수 초과에서 끊는다 */
export function buildClipsFromWords(words: readonly TranscriptWord[], opts: BuildClipsOptions): ClipState {
  const maxChars = opts.maxChars ?? CLIP_MAX_CHARS;
  const gapMs = opts.gapMs ?? CLIP_GAP_MS;
  const idGen = opts.idGen ?? defaultId;
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    chars = 0;
  };

  for (const word of [...words].sort((a, b) => a.startMs - b.startMs || a.idx - b.idx)) {
    const text = word.text.trim();
    if (!text) continue;
    const prev = current[current.length - 1];
    const addLen = text.length + (current.length ? 1 : 0);
    if (prev && (word.startMs - prev.endMs >= gapMs || chars + addLen > maxChars)) flush();
    current.push(word);
    chars += addLen;
    if (SENTENCE_END.test(text)) flush();
  }
  flush();

  const clips: EditClip[] = [];
  const nextWords: TranscriptWord[] = [];
  groups.forEach((group, idx) => {
    const id = idGen();
    const caption = captionFromWords(group);
    clips.push({
      id,
      projectId: opts.projectId,
      idx,
      sourceKind: opts.sourceKind ?? 'video-edit',
      sourceStartMs: Math.round(group[0].startMs),
      sourceEndMs: Math.round(group[group.length - 1].endMs),
      captionText: caption,
      captionTextOriginal: caption,
      captionEdited: false,
      enabled: group.some((w) => !w.deleted),
      speed: opts.speed ?? 1,
    });
    for (const w of group) nextWords.push({ ...w, clipId: id });
  });
  return { clips, words: nextWords };
}

export function clipWords(words: readonly TranscriptWord[], clipId: string): TranscriptWord[] {
  return words.filter((w) => w.clipId === clipId).sort((a, b) => a.startMs - b.startMs || a.idx - b.idx);
}

/** 남아 있는 단어로 자막 줄을 다시 만든다 */
export function captionFromWords(words: readonly TranscriptWord[]): string {
  return words.filter((w) => !w.deleted).map((w) => w.text.trim()).filter(Boolean).join(' ');
}

/** 지워진 단어들의 잘라낼 구간. 앞뒤 30ms 여백, 150ms 미만 간격은 하나로 병합 */
export function wordCutRanges(words: readonly TranscriptWord[], padMs = WORD_PADDING_MS, mergeGapMs = MERGE_GAP_MS): TimeRange[] {
  const sorted = [...words].filter((w) => w.deleted).sort((a, b) => a.startMs - b.startMs);
  const live = [...words].filter((w) => !w.deleted).sort((a, b) => a.startMs - b.startMs);
  const ranges: TimeRange[] = [];
  for (const w of sorted) {
    // 여백이 살아 있는 이웃 단어를 먹지 않게 제한한다
    const prev = live.filter((x) => x.endMs <= w.startMs).pop();
    const next = live.find((x) => x.startMs >= w.endMs);
    const startMs = Math.max(prev ? prev.endMs : 0, Math.round(w.startMs - padMs));
    const endMs = Math.min(next ? next.startMs : Number.MAX_SAFE_INTEGER, Math.round(w.endMs + padMs));
    // 여백 때문에 길이가 0 이하가 되면 그 삭제는 무시한다
    if (endMs > startMs) ranges.push({ startMs, endMs });
  }
  const merged = mergeRanges(ranges);
  const out: TimeRange[] = [];
  for (const r of merged) {
    const last = out[out.length - 1];
    if (last && r.startMs - last.endMs < mergeGapMs) last.endMs = r.endMs;
    else out.push({ ...r });
  }
  return out;
}

/** 클립에서 삭제되지 않고 남은 구간 (배속 적용 전 원본 기준) */
export function clipKeptRanges(clip: EditClip, words: readonly TranscriptWord[]): TimeRange[] {
  const cuts = wordCutRanges(clipWords(words, clip.id));
  const out: TimeRange[] = [];
  let pos = clip.sourceStartMs;
  for (const cut of cuts) {
    const start = Math.max(pos, clip.sourceStartMs);
    const end = Math.min(cut.startMs, clip.sourceEndMs);
    if (end > start) out.push({ startMs: start, endMs: end });
    pos = Math.max(pos, cut.endMs);
  }
  if (clip.sourceEndMs > pos) out.push({ startMs: Math.max(pos, clip.sourceStartMs), endMs: clip.sourceEndMs });
  return out.filter((r) => r.endMs > r.startMs);
}

/** 클립의 남은 구간을 EDL 세그먼트로 (PROMPT-v2 B-1) */
export function clipToEdlSegments(
  clip: EditClip, words: readonly TranscriptWord[], assetId: string, idGen: IdGen = defaultId, now = 0,
): EdlSegment[] {
  if (!clip.enabled) return [];
  return clipKeptRanges(clip, words).map((r, i) => ({
    id: idGen(),
    projectId: clip.projectId,
    assetId,
    order: i,
    sourceStartMs: r.startMs,
    sourceEndMs: r.endMs,
    enabled: true,
    origin: 'auto-filler' as const,
    updatedAt: now,
  }));
}

/** 클립의 실제 길이(ms). 지운 단어와 배속을 반영한다 */
export function recalcClipDuration(clip: EditClip, words: readonly TranscriptWord[]): number {
  if (!clip.enabled) return 0;
  const kept = clipKeptRanges(clip, words).reduce((a, r) => a + (r.endMs - r.startMs), 0);
  const speed = clip.speed > 0 ? clip.speed : 1;
  return Math.round(kept / speed);
}

function syncClip(clip: EditClip, words: readonly TranscriptWord[]): EditClip {
  const mine = clipWords(words, clip.id);
  const alive = mine.filter((w) => !w.deleted);
  const caption = captionFromWords(mine);
  const enabled = alive.length > 0;
  // 사용자가 직접 고친 자막은 덮어쓰지 않는다
  const captionText = clip.captionEdited ? clip.captionText : caption;
  if (clip.captionText === captionText && clip.captionTextOriginal === caption && clip.enabled === enabled) return clip;
  return { ...clip, captionText, captionTextOriginal: caption, enabled };
}

/** 단어 하나를 지운다(플래그만). 자막 줄과 클립 활성 상태가 함께 갱신된다 */
export function deleteWord(state: ClipState, wordId: string, now = Date.now()): ClipState {
  const target = state.words.find((w) => w.id === wordId);
  if (!target || target.deleted) return state;
  const words = state.words.map((w) => (w.id === wordId ? { ...w, deleted: true, deletedAt: now } : w));
  const clips = state.clips.map((c) => (c.id === target.clipId ? syncClip(c, words) : c));
  return { clips, words };
}

export function restoreWord(state: ClipState, wordId: string): ClipState {
  const target = state.words.find((w) => w.id === wordId);
  if (!target || !target.deleted) return state;
  const words = state.words.map((w) => (w.id === wordId ? { ...w, deleted: false, deletedAt: undefined } : w));
  const clips = state.clips.map((c) => (c.id === target.clipId ? syncClip(c, words) : c));
  return { clips, words };
}

/** 클립 전체를 끄고 켠다 (✕ 버튼 / 선택 삭제) */
export function setClipEnabled(state: ClipState, clipId: string, enabled: boolean, now = Date.now()): ClipState {
  const clip = state.clips.find((c) => c.id === clipId);
  if (!clip || clip.enabled === enabled) return state;
  const words = state.words.map((w) => (w.clipId === clipId
    ? { ...w, deleted: !enabled, deletedAt: enabled ? undefined : now }
    : w));
  const clips = state.clips.map((c) => (c.id === clipId ? { ...syncClip(c, words), enabled } : c));
  return { clips, words };
}

/** 자막 줄을 사용자가 직접 고침 (영상은 자르지 않는다) */
export function setCaptionText(state: ClipState, clipId: string, text: string): ClipState {
  const clips = state.clips.map((c) => (c.id === clipId ? { ...c, captionText: text, captionEdited: text !== c.captionTextOriginal } : c));
  return { ...state, clips };
}

export function resetCaption(state: ClipState, clipId: string): ClipState {
  const clips = state.clips.map((c) => (c.id === clipId ? { ...c, captionText: c.captionTextOriginal, captionEdited: false } : c));
  return { ...state, clips };
}

/** 단어 삭제를 EDL에 반영 (F-01: 제안이 아니라 즉시 반영) */
export function applyWordCuts(
  edl: readonly EdlSegment[], words: readonly TranscriptWord[], clipId: string, idGen: IdGen = defaultId, now = 0,
): EdlSegment[] {
  const cuts = wordCutRanges(clipWords(words, clipId));
  return applySuggestions(edl, cuts.map((r) => ({ startMs: r.startMs, endMs: r.endMs, source: 'filler' as const })), idGen, now);
}

/** 되돌리기: 그 단어가 차지하던 구간을 EDL에서 되살린다 */
export function restoreWordCut(edl: readonly EdlSegment[], word: TranscriptWord, padMs = WORD_PADDING_MS, now = 0): EdlSegment[] {
  return restoreRange(edl, { startMs: Math.round(word.startMs - padMs), endMs: Math.round(word.endMs + padMs) }, now);
}

/** 배속 계산용: 클립 구간 → SpeedRange */
export function clipSpeedRanges(clips: readonly EditClip[]): { startMs: number; endMs: number; speed: number }[] {
  return clips
    .filter((c) => c.enabled && c.speed > 0 && c.sourceEndMs > c.sourceStartMs)
    .map((c) => ({ startMs: c.sourceStartMs, endMs: c.sourceEndMs, speed: c.speed }))
    .sort((a, b) => a.startMs - b.startMs);
}

/** 재생 위치의 클립 (자동 따라가기 F-12) */
export function clipAtSource(clips: readonly EditClip[], sourceMs: number): EditClip | undefined {
  return clips.find((c) => sourceMs >= c.sourceStartMs && sourceMs < c.sourceEndMs);
}

export function renumberClips(clips: readonly EditClip[]): EditClip[] {
  return [...clips]
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs || a.idx - b.idx)
    .map((c, idx) => (c.idx === idx ? c : { ...c, idx }));
}
