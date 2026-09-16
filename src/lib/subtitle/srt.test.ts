import { describe, expect, it } from 'vitest';
import type { SubtitleCue } from '@/types/models';
import { formatSrtTime, formatVttTime, parseSubtitles, toSrt, toVtt } from './srt';

const cue = (s: number, e: number, text: string, orphan = false): SubtitleCue => ({
  id: text, projectId: 'p', idx: 0, startMs: s, endMs: e, sourceStartMs: s, sourceEndMs: e, orphan, text, locked: false,
});

describe('srt/vtt', () => {
  it('시간 표기', () => {
    expect(formatSrtTime(3_723_004)).toBe('01:02:03,004');
    expect(formatVttTime(1500)).toBe('00:00:01.500');
    expect(formatSrtTime(-1)).toBe('00:00:00,000');
  });

  it('toSrt: 정렬, orphan·빈 텍스트 제외, 1부터 번호', () => {
    const srt = toSrt([cue(2000, 3000, '둘'), cue(0, 1000, '하나'), cue(500, 600, '고아', true), cue(4000, 5000, '  ')]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,000\n하나\n\n2\n00:00:02,000 --> 00:00:03,000\n둘\n');
  });

  it('toVtt 헤더', () => {
    expect(toVtt([cue(0, 1000, '하나')])).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n하나\n');
  });

  it('SRT 왕복', () => {
    const cues = [cue(0, 1000, '하나'), cue(1500, 2750, '두 줄\n자막')];
    expect(parseSubtitles(toSrt(cues))).toEqual([
      { startMs: 0, endMs: 1000, text: '하나' },
      { startMs: 1500, endMs: 2750, text: '두 줄\n자막' },
    ]);
  });

  it('VTT: 헤더, 큐 id, 설정, 태그, 시 생략, CRLF, BOM', () => {
    const vtt = '﻿WEBVTT\r\n\r\nintro\r\n01:02.5 --> 01:04.000 align:start\r\n<b>안녕</b>\r\n\r\n';
    expect(parseSubtitles(vtt)).toEqual([{ startMs: 62_500, endMs: 64_000, text: '안녕' }]);
  });

  it('깨진 블록은 건너뜀', () => {
    const text = '1\n잘못된 줄\n텍스트\n\n2\n00:00:05,000 --> 00:00:04,000\n거꾸로\n\n3\n00:00:06,000 --> 00:00:07,000\n\n';
    expect(parseSubtitles(text)).toEqual([]);
  });
});
