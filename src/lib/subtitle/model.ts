// 자막 큐 모델. 큐는 "결과물 기준 시간(startMs/endMs)"과 "원본 기준 앵커(sourceStartMs/sourceEndMs)"를 함께 가진다.
// 컷 편집이 바뀌면 앵커에서 결과물 시간을 다시 계산하므로, 몇 번을 다시 잘라도 자막이 누적 오차 없이 따라간다.
import { nanoid } from 'nanoid';
import type { EdlSegment, StyleValues, SubtitleCue, WordLike } from '@/types/models';
import { nextKeptSourceMs, outputToSource, prevKeptSourceMs, sourceToOutput, sortSegments } from '@/lib/core/edl';

type IdGen = () => string;
const defaultId: IdGen = () => nanoid(10);

export const SENTENCE_GAP_MS = 700;
const SENTENCE_END = /[.?!。？！…]$/;

export const DEFAULT_STYLE_VALUES: StyleValues = {
  fontFamily: 'Pretendard',
  fontSize: 64,
  fontWeight: 700,
  color: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 6,
  shadowBlur: 4,
  bgColor: '#000000',
  bgOpacity: 0,
  bgPaddingX: 24,
  bgPaddingY: 10,
  bgRadius: 12,
  alignment: 'center',
  verticalPosition: 'bottom',
  marginBottom: 80,
  maxCharsPerLine: 24,
  maxLines: 2,
};

export interface WordsToCuesOptions {
  projectId: string;
  maxCharsPerLine: number;
  maxLines: number;
  gapMs?: number;
  edl?: readonly EdlSegment[];
  idGen?: IdGen;
}

/** 단어 → 문장 큐. 문장부호 / 0.7초 이상 간격 / 글자 수 한도에서 끊는다. */
export function wordsToCues(words: readonly WordLike[], opts: WordsToCuesOptions): SubtitleCue[] {
  const gapMs = opts.gapMs ?? SENTENCE_GAP_MS;
  const maxChars = Math.max(1, opts.maxCharsPerLine * opts.maxLines);
  const idGen = opts.idGen ?? defaultId;
  const groups: WordLike[][] = [];
  let current: WordLike[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
    chars = 0;
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = word.text.trim();
    if (!text) continue;
    const prev = current[current.length - 1];
    const addLen = text.length + (current.length ? 1 : 0);
    if (prev && (word.startMs - prev.endMs >= gapMs || chars + addLen > maxChars)) flush();
    current.push({ ...word, text });
    chars += text.length + (current.length > 1 ? 1 : 0);
    if (SENTENCE_END.test(text)) flush();
  }
  flush();

  const cues = groups.map((g, idx): SubtitleCue => {
    const sourceStartMs = Math.round(g[0].startMs);
    const sourceEndMs = Math.round(g[g.length - 1].endMs);
    return {
      id: idGen(), projectId: opts.projectId, idx,
      startMs: sourceStartMs, endMs: sourceEndMs, sourceStartMs, sourceEndMs,
      orphan: false, text: g.map((w) => w.text).join(' '), locked: false,
    };
  });
  return opts.edl ? remapCues(cues, opts.edl) : cues;
}

/** 줄바꿈. 명시적 줄바꿈을 존중하고, 단어 단위로 채우며, 너무 긴 단어는 강제로 자른다. 넘치는 줄은 마지막 줄에 붙인다(글자를 버리지 않기 위해). */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const max = Math.max(1, maxCharsPerLine);
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const rawWord of para.split(/\s+/).filter(Boolean)) {
      let word = rawWord;
      while (word.length > max) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, max));
        word = word.slice(max);
      }
      if (!word) continue;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  const trimmed = lines.length > 1 ? lines.filter((l, i) => l || i < lines.length - 1) : lines;
  const limit = Math.max(1, maxLines);
  if (trimmed.length <= limit) return trimmed;
  return [...trimmed.slice(0, limit - 1), trimmed.slice(limit - 1).join(' ')];
}

export function renumberCues(cues: readonly SubtitleCue[]): SubtitleCue[] {
  return [...cues]
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs || a.idx - b.idx)
    .map((c, idx) => (c.idx === idx ? c : { ...c, idx }));
}

/** EDL 변경 후 결과물 시간 재계산. 원본 구간이 전부 잘린 큐는 지우지 않고 orphan으로 표시한다. */
export function remapCues(cues: readonly SubtitleCue[], edl: readonly EdlSegment[]): SubtitleCue[] {
  return cues.map((cue) => remapCue(cue, edl));
}

export function remapCue(cue: SubtitleCue, edl: readonly EdlSegment[]): SubtitleCue {
  const keptStart = nextKeptSourceMs(cue.sourceStartMs, edl);
  const keptEnd = prevKeptSourceMs(cue.sourceEndMs, edl);
  if (keptStart === null || keptEnd === null || keptStart >= keptEnd) {
    return cue.orphan ? cue : { ...cue, orphan: true };
  }
  const startMs = sourceToOutput(keptStart, edl);
  const endMs = sourceToOutputEnd(keptEnd, edl);
  if (startMs === null || endMs === null || endMs <= startMs) return cue.orphan ? cue : { ...cue, orphan: true };
  if (!cue.orphan && cue.startMs === startMs && cue.endMs === endMs) return cue;
  return { ...cue, startMs, endMs, orphan: false };
}

/** 구간 끝은 "이전 구간의 끝"으로 매핑해야 다음 구간 시작과 헷갈리지 않는다 */
function sourceToOutputEnd(sourceMs: number, edl: readonly EdlSegment[]): number | null {
  let acc = 0;
  for (const seg of sortSegments(edl).filter((s) => s.enabled && s.sourceEndMs > s.sourceStartMs)) {
    if (sourceMs <= seg.sourceStartMs) return acc > 0 && sourceMs === seg.sourceStartMs ? acc : null;
    if (sourceMs <= seg.sourceEndMs) return acc + (sourceMs - seg.sourceStartMs);
    acc += seg.sourceEndMs - seg.sourceStartMs;
  }
  return null;
}

/** 2단계 편집: 결과물 시간으로 조정하면 원본 앵커도 함께 갱신 */
export function setCueTiming(cue: SubtitleCue, startMs: number, endMs: number, edl: readonly EdlSegment[]): SubtitleCue {
  const s = Math.max(0, Math.round(Math.min(startMs, endMs - 1)));
  const e = Math.round(Math.max(endMs, s + 1));
  const srcStart = outputToSource(s, edl, 'start');
  const srcEnd = outputToSource(e, edl, 'end');
  if (srcStart === null || srcEnd === null) return cue;
  return { ...cue, startMs: s, endMs: e, sourceStartMs: srcStart, sourceEndMs: srcEnd, orphan: false };
}

/** 원본 기준으로 옮기기(타임라인 드래그). 결과물 시간은 remap으로 계산 */
export function setCueSourceTiming(cue: SubtitleCue, sourceStartMs: number, sourceEndMs: number, edl: readonly EdlSegment[]): SubtitleCue {
  const s = Math.max(0, Math.round(Math.min(sourceStartMs, sourceEndMs - 1)));
  const e = Math.round(Math.max(sourceEndMs, s + 1));
  return remapCue({ ...cue, sourceStartMs: s, sourceEndMs: e }, edl);
}

export function mergeWithNext(cues: readonly SubtitleCue[], id: string): SubtitleCue[] {
  const sorted = renumberCues(cues);
  const i = sorted.findIndex((c) => c.id === id);
  const a = sorted[i];
  const b = sorted[i + 1];
  if (!a || !b) return sorted;
  const merged: SubtitleCue = {
    ...a,
    text: `${a.text} ${b.text}`.trim(),
    startMs: Math.min(a.startMs, b.startMs),
    endMs: Math.max(a.endMs, b.endMs),
    sourceStartMs: Math.min(a.sourceStartMs, b.sourceStartMs),
    sourceEndMs: Math.max(a.sourceEndMs, b.sourceEndMs),
    orphan: a.orphan && b.orphan,
  };
  return renumberCues([...sorted.slice(0, i), merged, ...sorted.slice(i + 2)]);
}

/** 글자 위치에서 나누고, 시간은 글자 수 비율로 나눈다 */
export function splitCue(cues: readonly SubtitleCue[], id: string, charIndex: number, idGen: IdGen = defaultId): SubtitleCue[] {
  const cue = cues.find((c) => c.id === id);
  if (!cue) return [...cues];
  const at = Math.min(Math.max(1, Math.round(charIndex)), cue.text.length - 1);
  const left = cue.text.slice(0, at).trim();
  const right = cue.text.slice(at).trim();
  if (!left || !right) return [...cues];
  const ratio = at / cue.text.length;
  const outMid = Math.round(cue.startMs + (cue.endMs - cue.startMs) * ratio);
  const srcMid = Math.round(cue.sourceStartMs + (cue.sourceEndMs - cue.sourceStartMs) * ratio);
  const a: SubtitleCue = { ...cue, text: left, endMs: outMid, sourceEndMs: srcMid };
  const b: SubtitleCue = { ...cue, id: idGen(), text: right, startMs: outMid, sourceStartMs: srcMid };
  return renumberCues(cues.flatMap((c) => (c.id === id ? [a, b] : [c])));
}

export function findReplace(
  cues: readonly SubtitleCue[], find: string, replace: string, caseSensitive = true,
): { cues: SubtitleCue[]; count: number } {
  if (!find) return { cues: [...cues], count: 0 };
  const pattern = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  let count = 0;
  const out = cues.map((c) => {
    const matches = c.text.match(pattern);
    if (!matches) return c;
    count += matches.length;
    return { ...c, text: c.text.replace(pattern, () => replace) };
  });
  return { cues: out, count };
}

/** 겹치는 큐 id (타임라인에서 빨간 테두리로 경고) */
export function findOverlaps(cues: readonly SubtitleCue[]): Set<string> {
  const live = cues.filter((c) => !c.orphan).sort((a, b) => a.startMs - b.startMs);
  const out = new Set<string>();
  let maxEnd = -1;
  let maxEndId = '';
  for (const c of live) {
    if (c.startMs < maxEnd) {
      out.add(c.id);
      out.add(maxEndId);
    }
    if (c.endMs > maxEnd) { maxEnd = c.endMs; maxEndId = c.id; }
  }
  return out;
}

export function activeCueAt(cues: readonly SubtitleCue[], outputMs: number): SubtitleCue | undefined {
  return cues.find((c) => !c.orphan && outputMs >= c.startMs && outputMs < c.endMs);
}

/** 고아 큐를 가장 가까운 남은 구간에 붙인다 (원래 길이 유지, 구간 밖으로는 안 나감) */
export function attachOrphanToNearest(cue: SubtitleCue, edl: readonly EdlSegment[]): SubtitleCue {
  const kept = sortSegments(edl).filter((s) => s.enabled && s.sourceEndMs > s.sourceStartMs);
  if (kept.length === 0) return cue;
  const dist = (s: EdlSegment) => (cue.sourceStartMs < s.sourceStartMs ? s.sourceStartMs - cue.sourceStartMs : Math.max(0, cue.sourceStartMs - s.sourceEndMs));
  const target = kept.reduce((best, s) => (dist(s) < dist(best) ? s : best), kept[0]);
  const duration = Math.max(1, cue.sourceEndMs - cue.sourceStartMs);
  const segLen = target.sourceEndMs - target.sourceStartMs;
  const len = Math.min(duration, segLen);
  const start = cue.sourceStartMs < target.sourceStartMs ? target.sourceStartMs : target.sourceEndMs - len;
  return remapCue({ ...cue, sourceStartMs: start, sourceEndMs: start + len }, edl);
}
