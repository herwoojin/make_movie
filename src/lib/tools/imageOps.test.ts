import { describe, expect, it } from 'vitest';
import { outputFileName, planImageEdit } from './imageOps';

const none = { left: 0, top: 0, right: 0, bottom: 0 };

describe('planImageEdit', () => {
  it('변경 없음', () => {
    expect(planImageEdit(400, 300, { rotation: 0, flipX: false, crop: none, targetWidth: 0 })).toEqual({
      source: { x: 0, y: 0, w: 400, h: 300 }, output: { width: 400, height: 300 }, scale: 1,
    });
  });
  it('90도 회전은 가로세로가 바뀐다', () => {
    expect(planImageEdit(400, 300, { rotation: 90, flipX: false, crop: none, targetWidth: 0 }).output).toEqual({ width: 300, height: 400 });
  });
  it('자르기 + 크기 조절', () => {
    const plan = planImageEdit(1000, 500, { rotation: 0, flipX: false, crop: { left: 0.1, top: 0.2, right: 0.1, bottom: 0 }, targetWidth: 400 });
    expect(plan.source).toEqual({ x: 100, y: 100, w: 800, h: 400 });
    expect(plan.output).toEqual({ width: 400, height: 200 });
  });
  it('자르기가 겹치면 최소 5%는 남긴다', () => {
    const plan = planImageEdit(100, 100, { rotation: 180, flipX: true, crop: { left: 0.9, top: 0, right: 0.9, bottom: 0 }, targetWidth: 0 });
    expect(plan.source.w).toBeGreaterThanOrEqual(5);
  });
  it('파일 이름', () => {
    expect(outputFileName('사진.heic', 'jpeg')).toBe('사진_편집ON.jpg');
    expect(outputFileName('a.png', 'webp')).toBe('a_편집ON.webp');
  });
});
