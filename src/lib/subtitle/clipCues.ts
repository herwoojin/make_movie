// v2: 자막의 진실은 EditClip이다. SubtitleCue는 SRT/VTT/ASS 입출력에서만 쓰는 중간 표현.
// 미리보기·내보내기는 "원본 시각 → 그 시각의 클립"으로 자막을 찾고(시간 변환이 끼지 않아 어긋날 일이 없다),
// 파일로 내보낼 때만 결과물 시간으로 바꾼다.
import { nanoid } from 'nanoid';
import type { EdlSegment, EditClip, SubtitleCue, TranscriptWord } from '@/types/models';
import { createTimeMap, nextKeptSourceMs, prevKeptSourceMs, type SpeedRange, type TimeMap } from '@/lib/core/edl';
import { clipKeptRanges } from '@/lib/core/clips';

export type CaptionLang = 'original' | 'translated';

export function clipCaption(clip: EditClip, lang: CaptionLang = 'original'): string {
  if (lang === 'translated' && clip.translatedText?.trim()) return clip.translatedText;
  return clip.captionText;
}

/** 원본 시각에 보여줄 클립 (미리보기·내보내기 공용) */
export function clipAtSourceMs(clips: readonly EditClip[], sourceMs: number): EditClip | undefined {
  for (const clip of clips) {
    if (!clip.enabled || !clip.captionText.trim()) continue;
    if (sourceMs >= clip.sourceStartMs && sourceMs < clip.sourceEndMs) return clip;
  }
  return undefined;
}

/** 클립 → 결과물 기준 자막 큐 (SRT/VTT/ASS 내보내기용) */
export function clipsToCues(
  clips: readonly EditClip[], edl: readonly EdlSegment[], speeds: readonly SpeedRange[] = [], defaultSpeed = 1,
  lang: CaptionLang = 'original', map?: TimeMap,
): SubtitleCue[] {
  const timeMap = map ?? createTimeMap(edl, speeds, defaultSpeed);
  const cues: SubtitleCue[] = [];
  const sorted = [...clips].sort((a, b) => a.sourceStartMs - b.sourceStartMs);
  sorted.forEach((clip) => {
    const text = clipCaption(clip, lang).trim();
    if (!clip.enabled || !text) return;
    // 클립 안에서 실제로 남아 있는 첫·마지막 지점을 찾아 결과물 시간으로 옮긴다
    const startSource = nextKeptSourceMs(clip.sourceStartMs, edl);
    const endSource = prevKeptSourceMs(clip.sourceEndMs, edl);
    if (startSource === null || endSource === null || endSource <= startSource) return;
    if (startSource >= clip.sourceEndMs || endSource <= clip.sourceStartMs) return;
    const startMs = timeMap.toOutput(Math.max(startSource, clip.sourceStartMs));
    const endMs = timeMap.toOutput(Math.min(endSource, clip.sourceEndMs));
    if (startMs === null || endMs === null || endMs <= startMs) return;
    cues.push({
      id: `cue-${clip.id}`,
      projectId: clip.projectId,
      idx: cues.length,
      startMs,
      endMs,
      sourceStartMs: clip.sourceStartMs,
      sourceEndMs: clip.sourceEndMs,
      orphan: false,
      text,
      locked: false,
      ...(clip.styleOverride ? { styleOverride: clip.styleOverride } : {}),
    });
  });
  return cues;
}

/** 클립이 결과물에서 차지하는 구간(자동 따라가기·타임라인 표시용) */
export function clipOutputRange(clip: EditClip, words: readonly TranscriptWord[], map: TimeMap): { startMs: number; endMs: number } | null {
  const kept = clipKeptRanges(clip, words);
  if (kept.length === 0) return null;
  const startMs = map.toOutput(kept[0].startMs);
  const endMs = map.toOutput(kept[kept.length - 1].endMs);
  if (startMs === null || endMs === null) return null;
  return { startMs, endMs };
}

export interface ParsedCue {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * 외부 SRT/VTT → 클립 + 단어 (F-02-3 "영상 + SRT 열기").
 * 단어 단위 타임스탬프가 없으므로 공백으로 나누고 글자 수에 비례해 시간을 추정한다.
 * 그래서 칩 삭제 정밀도가 낮다는 것을 UI에서 알려야 한다.
 */
export function cuesToClips(
  cues: readonly ParsedCue[], projectId: string, transcriptId = 'imported', idGen: () => string = () => nanoid(10),
): { clips: EditClip[]; words: TranscriptWord[] } {
  const clips: EditClip[] = [];
  const words: TranscriptWord[] = [];
  let wordIdx = 0;
  cues.forEach((cue, idx) => {
    const id = idGen();
    const text = cue.text.replace(/\s+/g, ' ').trim();
    clips.push({
      id, projectId, idx, sourceKind: 'source-audio',
      sourceStartMs: Math.round(cue.startMs), sourceEndMs: Math.round(cue.endMs),
      captionText: text, captionTextOriginal: text, captionEdited: false, enabled: true, speed: 1,
    });
    const tokens = text.split(' ').filter(Boolean);
    const totalChars = tokens.reduce((a, t) => a + t.length, 0) || 1;
    let cursor = cue.startMs;
    tokens.forEach((token) => {
      const span = ((cue.endMs - cue.startMs) * token.length) / totalChars;
      const startMs = Math.round(cursor);
      const endMs = Math.round(cursor + span);
      words.push({
        id: `${id}-w${wordIdx}`, transcriptId, idx: wordIdx, startMs, endMs: Math.max(endMs, startMs + 1),
        text: token, isFiller: false, clipId: id, deleted: false,
      });
      wordIdx += 1;
      cursor += span;
    });
  });
  return { clips, words };
}
