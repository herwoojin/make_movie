// 자막 표시 모델. v2에서 자막의 진실은 EditClip이고(→ lib/core/clips.ts, lib/subtitle/clipCues.ts),
// 여기는 "어떻게 보이는가"(기본 서식·줄바꿈)와 굽기 시점의 큐 조회만 담는다.
import type { StyleValues, SubtitleCue } from '@/types/models';

export const DEFAULT_STYLE_VALUES: StyleValues = {
  fontFamily: 'Pretendard',
  fontSize: 64,
  fontWeight: 700,
  italic: false,
  color: '#FFFFFF',
  outlineEnabled: true,
  outlineColor: '#000000',
  outlineWidth: 6,
  shadowBlur: 4,
  bgEnabled: false,
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

/** 굽기(내보내기)에서 결과물 시각에 보여줄 큐. 큐는 clipsToCues가 만든 결과물 기준 시간을 갖는다 */
export function activeCueAt(cues: readonly SubtitleCue[], outputMs: number): SubtitleCue | undefined {
  return cues.find((c) => outputMs >= c.startMs && outputMs < c.endMs);
}
