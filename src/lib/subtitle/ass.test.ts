import { describe, expect, it } from 'vitest';
import type { SubtitleCue } from '@/types/models';
import { assAlignment, assColor, assTime, toAss } from './ass';
import { DEFAULT_STYLE_VALUES } from './model';

const cue = (s: number, e: number, text: string, orphan = false): SubtitleCue => ({
  id: text, projectId: 'p', idx: 0, startMs: s, endMs: e, sourceStartMs: s, sourceEndMs: e, orphan, text, locked: false,
});

describe('ass', () => {
  it('assColor는 &HAABBGGRR', () => {
    expect(assColor('#FF8800')).toBe('&H000088FF');
    expect(assColor('#000000', 0.5)).toBe('&H80000000');
    expect(assColor('bad')).toBe('&H00FFFFFF');
  });

  it('assTime은 센티초', () => {
    expect(assTime(3_723_456)).toBe('1:02:03.46');
    expect(assTime(0)).toBe('0:00:00.00');
  });

  it('정렬 번호(키패드)', () => {
    expect(assAlignment({ alignment: 'center', verticalPosition: 'bottom' })).toBe(2);
    expect(assAlignment({ alignment: 'left', verticalPosition: 'top' })).toBe(7);
    expect(assAlignment({ alignment: 'right', verticalPosition: 'middle' })).toBe(6);
  });

  it('toAss: 해상도, 스타일, 줄바꿈, 이스케이프, orphan 제외', () => {
    const ass = toAss(
      [cue(1000, 2000, '가나 다라 {태그}'), cue(0, 500, '고아', true)],
      { ...DEFAULT_STYLE_VALUES, maxCharsPerLine: 5, maxLines: 3 },
      1280, 720,
    );
    expect(ass).toContain('PlayResX: 1280');
    expect(ass).toContain('PlayResY: 720');
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,가나 다라\\N\\{태그\\}');
    expect(ass).not.toContain('고아');
    const style = ass.split('\n').find((l) => l.startsWith('Style:'))!;
    expect(style.split(',')[2]).toBe(String(Math.round(64 * (1280 / 1920) * 1.2)));
    expect(style.split(',')[15]).toBe('1');
  });

  it('배경 박스가 있으면 BorderStyle 3', () => {
    const ass = toAss([cue(0, 1000, 'a')], { ...DEFAULT_STYLE_VALUES, bgOpacity: 0.6, shadowBlur: 0 }, 1920, 1080);
    const fields = ass.split('\n').find((l) => l.startsWith('Style:'))!.split(',');
    expect(fields[15]).toBe('3');
    expect(fields[17]).toBe('0');
  });
});
