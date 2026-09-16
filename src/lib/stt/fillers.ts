// 추임새(필러) 사전과 매칭 (TRD 4.3). 단어 단위 타임스탬프가 있어야 동작한다.
import type { CutSuggestion, WordLike } from '@/types/models';

export interface FillerEntry {
  word: string;
  enabled: boolean;
}

// '그', '저', '뭐'는 "그 사람", "저 책"처럼 의미 있는 단어로도 쓰이므로 기본 비활성
const DISABLED_BY_DEFAULT = new Set(['그', '저', '뭐']);
export const DEFAULT_FILLERS: FillerEntry[] = [
  '어', '음', '그', '저', '아', '뭐', '이제', '그니까', '그러니까', '인제', '어어', '음음', '아아', '그래서 뭐',
].map((word) => ({ word, enabled: !DISABLED_BY_DEFAULT.has(word) }));

export const FILLER_PADDING_MS = 30;
export const FILLER_BRIDGE_GAP_MS = 150;
const MAX_PHRASE_WORDS = 3;

/** 공백·문장부호·기호 제거 후 비교 ("음," " 음..." 모두 "음") */
export function normalizeWord(text: string): string {
  return text.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

export function matchFillers(
  words: readonly WordLike[], dictionary: readonly FillerEntry[], projectId = '',
): CutSuggestion[] {
  const active = new Set(dictionary.filter((d) => d.enabled).map((d) => normalizeWord(d.word)).filter(Boolean));
  if (active.size === 0 || words.length === 0) return [];
  const norm = words.map((w) => normalizeWord(w.text));

  const hits: { from: number; to: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    // 긴 구절("그래서 뭐")을 먼저 시도해야 "뭐"만 따로 잡히지 않는다
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - i); len >= 1; len--) {
      const phrase = norm.slice(i, i + len).join('');
      if (phrase && active.has(phrase)) {
        hits.push({ from: i, to: i + len - 1 });
        i += len - 1;
        break;
      }
    }
  }

  const ranges = hits.map(({ from, to }) => {
    const prev = words[from - 1];
    const next = words[to + 1];
    let start = words[from].startMs - FILLER_PADDING_MS;
    let end = words[to].endMs + FILLER_PADDING_MS;
    // 여백이 이웃 단어를 먹지 않게 제한하고, 간격이 아주 짧으면 이웃까지 붙여 자연스럽게 잇는다
    if (prev) {
      start = Math.max(start, prev.endMs);
      if (start - prev.endMs < FILLER_BRIDGE_GAP_MS) start = prev.endMs;
    }
    if (next) {
      end = Math.min(end, next.startMs);
      if (next.startMs - end < FILLER_BRIDGE_GAP_MS) end = next.startMs;
    }
    const label = words.slice(from, to + 1).map((w) => w.text.trim()).join(' ');
    const confidence = average(words.slice(from, to + 1).map((w) => w.confidence ?? 0.8));
    return { startMs: Math.max(0, Math.round(start)), endMs: Math.round(end), label, confidence };
  });

  // 연속 필러("어 음")는 하나의 컷으로
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
      last.label = `${last.label} ${r.label}`;
      last.confidence = Math.min(last.confidence, r.confidence);
    } else {
      merged.push({ ...r });
    }
  }

  return merged
    .filter((r) => r.endMs > r.startMs)
    .map((r) => ({
      id: `filler-${r.startMs}-${r.endMs}`,
      projectId,
      startMs: r.startMs,
      endMs: r.endMs,
      source: 'filler' as const,
      confidence: r.confidence,
      label: r.label,
      decision: 'pending' as const,
    }));
}

function average(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
