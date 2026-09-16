// ASS 자막 생성 (ffmpeg subtitles 필터 번인용). drawtext보다 외곽선·그림자·박스 표현력이 좋다.
// WebCodecs 경로는 renderSubtitleToCanvas를 직접 쓰므로, 이 파일은 ffmpeg 폴백에서만 쓰인다.
import type { StyleValues, SubtitleCue } from '@/types/models';
import { wrapText } from './model';

/** Canvas px(em 크기)와 libass 글꼴 크기(ascent+descent 기준)의 차이 보정. Pretendard 기준 근사값 */
export const ASS_FONT_SCALE = 1.2;

export function assColor(hex: string, opacity = 1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : 'FFFFFF';
  const [r, g, b] = [rgb.slice(0, 2), rgb.slice(2, 4), rgb.slice(4, 6)];
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255).toString(16).padStart(2, '0');
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

export function assTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(t / 360_000);
  const m = Math.floor((t % 360_000) / 6000);
  const s = Math.floor((t % 6000) / 100);
  const cs = t % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function assAlignment(style: Pick<StyleValues, 'alignment' | 'verticalPosition'>): number {
  const col = style.alignment === 'left' ? 1 : style.alignment === 'right' ? 3 : 2;
  const row = style.verticalPosition === 'top' ? 6 : style.verticalPosition === 'middle' ? 3 : 0;
  return row + col;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

export function toAss(cues: readonly SubtitleCue[], style: StyleValues, videoWidth: number, videoHeight: number): string {
  const scale = videoWidth / 1920;
  const box = style.bgOpacity > 0;
  const fontSize = Math.round(style.fontSize * scale * ASS_FONT_SCALE);
  const outline = box ? Math.round(style.bgPaddingY * scale) : Math.round(style.outlineWidth * scale);
  const shadow = style.shadowBlur > 0 ? Math.max(1, Math.round((style.shadowBlur * scale) / 2)) : 0;
  const marginV = Math.round(style.marginBottom * scale);
  const marginH = Math.round(40 * scale);
  // BorderStyle 3(불투명 박스)에서는 libass가 OutlineColour로 박스를 칠한다
  const outlineColour = box ? assColor(style.bgColor, style.bgOpacity) : assColor(style.outlineColor);
  const styleLine = [
    'Default', style.fontFamily, fontSize, assColor(style.color), assColor(style.color), outlineColour,
    assColor('#000000', 0.5), style.fontWeight >= 600 ? -1 : 0, 0, 0, 0, 100, 100, 0, 0,
    box ? 3 : 1, outline, shadow, assAlignment(style), marginH, marginH, marginV, 1,
  ].join(',');

  const events = cues
    .filter((c) => !c.orphan && c.text.trim() && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((c) => {
      const text = wrapText(c.text, style.maxCharsPerLine, style.maxLines).map(escapeText).join('\\N');
      return `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${text}`;
    });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${videoWidth}`,
    `PlayResY: ${videoHeight}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleLine}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
