// v2: 자막의 진실은 EditClip이다. SubtitleCue는 자막을 "결과물 시각"에 놓은 표시용 중간 표현.
// 미리보기·자막 넣은 영상·SRT/VTT가 모두 clipsToCues가 만든 같은 큐를 쓴다 — 그래야 "먼저 보여주기" 같은
// 타이밍 조정이 세 곳에서 똑같이 보인다. 클립(단어 시간) 자체는 건드리지 않는다.
import { nanoid } from 'nanoid';
import type { CaptionLang, EdlSegment, EditClip, SubtitleCue, TranscriptWord } from '@/types/models';
import { clipKeptRanges, clipSpeedRanges, tightenCjk } from '@/lib/core/clips';
import { createTimeMap, nextKeptSourceMs, prevKeptSourceMs, type SpeedRange, type TimeMap } from '@/lib/core/edl';
import { activeCueAt } from './model';

/** 자막을 음성보다 먼저 띄우는 시간 (ms). 0이면 끔 */
export const CAPTION_LEAD_PRESETS = [0, 200, 300, 500] as const;
export const MAX_CAPTION_LEAD_MS = 1000;

/**
 * 자막을 말이 시작되기 조금 전에 띄워 읽을 시간을 준다.
 * - 앞 자막이 아직 떠 있는 동안에는 당겨오지 않는다(겹치지 않게 앞 자막 끝에서 멈춘다)
 * - 영상 시작(0초) 앞으로는 가지 않는다
 * - 원래 시작보다 늦어지는 일은 없다
 */
export function applyCaptionLead(cues: readonly SubtitleCue[], leadMs: number): SubtitleCue[] {
  const lead = Math.min(MAX_CAPTION_LEAD_MS, Math.max(0, Math.round(Number.isFinite(leadMs) ? leadMs : 0)));
  if (lead === 0) return [...cues];
  let prevEnd = 0;
  return cues.map((cue) => {
    const startMs = Math.min(cue.startMs, Math.max(prevEnd, cue.startMs - lead, 0));
    prevEnd = Math.max(prevEnd, cue.endMs);
    return startMs === cue.startMs ? cue : { ...cue, startMs };
  });
}

export type { CaptionLang };

/** 화면·파일에 나갈 자막 글자. 번역을 고르면 번역이 없는 줄만 원어로 나간다 */
export function clipCaption(clip: EditClip, lang: CaptionLang = 'original'): string {
  if (lang === 'translated' && clip.translatedText?.trim()) return clip.translatedText;
  // 예전에 일본어·중국어 글자 사이에 띄어쓰기를 넣어 만든 자막도 붙여서 보여 준다 (직접 고친 자막은 그대로)
  return clip.captionEdited ? clip.captionText : tightenCjk(clip.captionText);
}

/** 원본 시각에 걸쳐 있는 클립 (목록의 "지금 재생 중" 표시용 — 자막 표시는 clipsToCues를 쓴다) */
export function clipAtSourceMs(clips: readonly EditClip[], sourceMs: number): EditClip | undefined {
  for (const clip of clips) {
    if (!clip.enabled || !clip.captionText.trim()) continue;
    if (sourceMs >= clip.sourceStartMs && sourceMs < clip.sourceEndMs) return clip;
  }
  return undefined;
}

export interface ClipsToCuesOptions {
  lang?: CaptionLang;
  map?: TimeMap;
  /** 자막을 음성보다 먼저 띄우는 시간 (ms) */
  leadMs?: number;
}

/** 클립 → 결과물 기준 자막 큐 (미리보기·자막 넣은 영상·SRT/VTT/ASS 공용) */
export function clipsToCues(
  clips: readonly EditClip[], edl: readonly EdlSegment[], speeds: readonly SpeedRange[] = [], defaultSpeed = 1,
  opts: ClipsToCuesOptions = {},
): SubtitleCue[] {
  const lang = opts.lang ?? 'original';
  const map = opts.map;
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
  return applyCaptionLead(cues, opts.leadMs ?? 0);
}

export interface CaptionDoc {
  clips: readonly EditClip[];
  edl: readonly EdlSegment[];
  view: { globalSpeed: number; captionLeadMs: number; captionLang?: CaptionLang };
}

/**
 * 미리보기용: 원본 시각 → 그때 화면에 보일 자막.
 * 편집 문서가 바뀔 때만 큐를 다시 만들고(프레임마다 만들지 않는다), 내보내기와 같은 큐를 쓴다.
 */
export function createCaptionLookup(): (doc: CaptionDoc, sourceMs: number) => SubtitleCue | undefined {
  let key: { clips: CaptionDoc['clips']; edl: CaptionDoc['edl']; speed: number; lead: number; lang: CaptionLang } | null = null;
  let map: TimeMap | null = null;
  let cues: SubtitleCue[] = [];
  return (doc, sourceMs) => {
    const lang = doc.view.captionLang ?? 'original';
    if (!key || key.clips !== doc.clips || key.edl !== doc.edl || key.speed !== doc.view.globalSpeed || key.lead !== doc.view.captionLeadMs || key.lang !== lang) {
      map = createTimeMap(doc.edl, clipSpeedRanges(doc.clips), doc.view.globalSpeed);
      cues = clipsToCues(doc.clips, doc.edl, [], 1, { map, leadMs: doc.view.captionLeadMs, lang });
      key = { clips: doc.clips, edl: doc.edl, speed: doc.view.globalSpeed, lead: doc.view.captionLeadMs, lang };
    }
    const out = map?.toOutput(sourceMs) ?? null;
    return out === null ? undefined : activeCueAt(cues, out);
  };
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
