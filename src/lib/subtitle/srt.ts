// SRT / VTT 내보내기·불러오기. 결과물 기준 시간으로 쓴다(내보낸 영상과 함께 재생하기 때문).
import type { SubtitleCue } from '@/types/models';

export interface ParsedCue { startMs: number; endMs: number; text: string }

const p2 = (n: number) => String(n).padStart(2, '0');
const p3 = (n: number) => String(n).padStart(3, '0');

function hmsms(ms: number): [string, string, string, string] {
  const t = Math.max(0, Math.round(ms));
  return [p2(Math.floor(t / 3_600_000)), p2(Math.floor((t % 3_600_000) / 60_000)), p2(Math.floor((t % 60_000) / 1000)), p3(t % 1000)];
}

export function formatSrtTime(ms: number): string {
  const [h, m, s, x] = hmsms(ms);
  return `${h}:${m}:${s},${x}`;
}

export function formatVttTime(ms: number): string {
  const [h, m, s, x] = hmsms(ms);
  return `${h}:${m}:${s}.${x}`;
}

function exportable(cues: readonly SubtitleCue[]): SubtitleCue[] {
  return cues.filter((c) => !c.orphan && c.text.trim() && c.endMs > c.startMs).sort((a, b) => a.startMs - b.startMs);
}

export function toSrt(cues: readonly SubtitleCue[]): string {
  return exportable(cues)
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text.trim()}\n`)
    .join('\n');
}

export function toVtt(cues: readonly SubtitleCue[]): string {
  const body = exportable(cues)
    .map((c) => `${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}\n${c.text.trim()}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

const TIME_LINE = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function toMs(h: string | undefined, m: string, s: string, frac: string): number {
  return (Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, '0'));
}

/** SRT·VTT 둘 다 받는다. 형식이 깨진 블록은 조용히 건너뛴다(한 줄 오류로 전체 불러오기가 실패하지 않게). */
export function parseSubtitles(text: string): ParsedCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const out: ParsedCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => TIME_LINE.test(l));
    if (timeIdx < 0) continue;
    const m = TIME_LINE.exec(lines[timeIdx]);
    if (!m) continue;
    const startMs = toMs(m[1], m[2], m[3], m[4]);
    const endMs = toMs(m[5], m[6], m[7], m[8]);
    const body = lines.slice(timeIdx + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (!body || endMs <= startMs) continue;
    out.push({ startMs, endMs, text: body });
  }
  return out;
}
