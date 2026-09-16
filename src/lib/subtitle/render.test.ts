import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_VALUES } from './model';
import { renderSubtitleToCanvas, subtitleFont, type Ctx2D } from './render';

interface Call { op: string; args: unknown[]; state: Record<string, unknown> }

/** 호출만 기록하는 가짜 2D 컨텍스트: 글자 너비 = 글자 수 × 10px */
function fakeCtx(width = 1920, height = 1080) {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: '', textAlign: 'start', fillStyle: '', strokeStyle: '', lineWidth: 1, shadowBlur: 0 };
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args, state: { ...state } }); };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'canvas') return { width, height };
      if (prop === 'measureText') return (t: string) => ({ width: t.length * 10 });
      if (prop in target) return target[prop];
      return record(prop);
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as Ctx2D, calls };
}

const style = { ...DEFAULT_STYLE_VALUES, maxCharsPerLine: 10, maxLines: 2 };

describe('renderSubtitleToCanvas', () => {
  it('빈 자막은 아무것도 그리지 않는다', () => {
    const { ctx, calls } = fakeCtx();
    renderSubtitleToCanvas(ctx, { text: '   ' }, style, 1920);
    expect(calls.filter((c) => c.op === 'fillText')).toHaveLength(0);
  });

  it('줄바꿈된 줄마다 외곽선 → 채우기 순서로 그린다 (아래 정렬, 가운데)', () => {
    const { ctx, calls } = fakeCtx();
    renderSubtitleToCanvas(ctx, { text: '가나다라 마바사아 자차카타' }, style, 1920);
    const fills = calls.filter((c) => c.op === 'fillText');
    const strokes = calls.filter((c) => c.op === 'strokeText');
    expect(fills.map((c) => c.args[0])).toEqual(['가나다라 마바사아', '자차카타']);
    expect(strokes).toHaveLength(2);
    expect(calls.findIndex((c) => c.op === 'strokeText')).toBeLessThan(calls.findIndex((c) => c.op === 'fillText'));
    // 가운데 정렬 기준점
    expect(fills[0].args[1]).toBe(960);
    // 두 번째 줄이 아래에 있고, 블록 아래끝은 화면 아래 - marginBottom
    const y0 = fills[0].args[2] as number;
    const y1 = fills[1].args[2] as number;
    expect(y1).toBeGreaterThan(y0);
    const lineH = style.fontSize * 1.25;
    expect(y1 + lineH / 2 + style.bgPaddingY).toBeCloseTo(1080 - style.marginBottom, 5);
    expect(strokes[0].state.lineWidth).toBe(style.outlineWidth * 2);
  });

  it('영상 가로 크기에 비례해 글꼴 크기가 바뀐다', () => {
    expect(subtitleFont(style, 1920)).toContain('64.00px');
    expect(subtitleFont(style, 960)).toContain('32.00px');
  });

  it('배경 박스와 styleOverride, 왼쪽·위 정렬, 외곽선 없음', () => {
    const { ctx, calls } = fakeCtx(1280, 720);
    renderSubtitleToCanvas(ctx, { text: '박스', styleOverride: { bgOpacity: 0.5, outlineWidth: 0, shadowBlur: 0, alignment: 'left', verticalPosition: 'top' } }, style, 1280);
    expect(calls.some((c) => c.op === 'fill')).toBe(true);
    expect(calls.filter((c) => c.op === 'strokeText')).toHaveLength(0);
    const fill = calls.find((c) => c.op === 'fillText')!;
    const scale = 1280 / 1920;
    expect(fill.args[1]).toBeCloseTo((40 + style.bgPaddingX) * scale, 5);
    expect(fill.state.textAlign).toBe('left');
    expect(fill.args[2] as number).toBeLessThan(200);
    expect(calls.find((c) => c.op === 'fill')!.state.fillStyle).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('오른쪽·가운데(세로) 정렬', () => {
    const { ctx, calls } = fakeCtx();
    renderSubtitleToCanvas(ctx, { text: '오른쪽' }, { ...style, alignment: 'right', verticalPosition: 'middle', bgOpacity: 0.3 }, 1920);
    const fill = calls.find((c) => c.op === 'fillText')!;
    expect(fill.args[1]).toBe(1920 - 40 - style.bgPaddingX);
    expect(Math.abs((fill.args[2] as number) - 540)).toBeLessThan(1);
  });
});
