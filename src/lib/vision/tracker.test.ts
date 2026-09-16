import { describe, expect, it } from 'vitest';
import { boxAt, iou, lerpBox, scaleBox, trackDetections, trackSpan, type Detection } from './tracker';

const det = (x: number, y: number, w = 0.1, h = 0.1, score = 0.9): Detection => ({ x, y, w, h, score });

describe('iou', () => {
  it('완전히 같으면 1, 안 겹치면 0', () => {
    expect(iou(det(0, 0), det(0, 0))).toBe(1);
    expect(iou(det(0, 0), det(0.5, 0.5))).toBe(0);
  });
  it('절반 겹침', () => {
    expect(iou({ x: 0, y: 0, w: 2, h: 1 }, { x: 1, y: 0, w: 2, h: 1 })).toBeCloseTo(1 / 3);
  });
  it('면적 0이면 0', () => {
    expect(iou({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0);
  });
});

describe('trackDetections', () => {
  it('조금씩 움직이는 얼굴은 한 트랙', () => {
    const frames = [0, 1, 2, 3].map((i) => ({ timeMs: i * 166, detections: [det(0.1 + i * 0.01, 0.1)] }));
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].keyframes).toHaveLength(4);
    expect(tracks[0].id).toBe('person-1');
  });

  it('IoU 0.3 이하로 튀면 새 트랙', () => {
    const frames = [{ timeMs: 0, detections: [det(0.1, 0.1)] }, { timeMs: 100, detections: [det(0.6, 0.6)] }];
    expect(trackDetections(frames)).toHaveLength(2);
  });

  it('두 사람을 각각 추적 (그리디: 더 많이 겹치는 쪽 우선)', () => {
    const frames = [
      { timeMs: 0, detections: [det(0.1, 0.1), det(0.7, 0.1)] },
      { timeMs: 100, detections: [det(0.71, 0.1), det(0.11, 0.1)] },
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(2);
    const left = tracks.find((t) => t.keyframes[0].x === 0.1)!;
    expect(left.keyframes[1].x).toBe(0.11);
  });

  it('1~2번 놓쳤다 다시 찾으면 같은 트랙 + 보간 키프레임', () => {
    const frames = [
      { timeMs: 0, detections: [det(0.1, 0.1)] },
      { timeMs: 100, detections: [] },
      { timeMs: 200, detections: [] },
      { timeMs: 300, detections: [det(0.13, 0.1)] },
    ];
    const [track, ...rest] = trackDetections(frames);
    expect(rest).toHaveLength(0);
    expect(track.keyframes.map((k) => [k.timeMs, k.interpolated])).toEqual([[0, false], [100, true], [200, true], [300, false]]);
    expect(track.keyframes[1].x).toBeCloseTo(0.11);
  });

  it('3프레임 연속 미검출 시 종료, 같은 위치에 다시 나타나면 새 ID', () => {
    const frames = [
      { timeMs: 0, detections: [det(0.1, 0.1)] },
      { timeMs: 100, detections: [] },
      { timeMs: 200, detections: [] },
      { timeMs: 300, detections: [] },
      { timeMs: 400, detections: [det(0.1, 0.1)] },
    ];
    const tracks = trackDetections(frames, { idPrefix: 'p' });
    expect(tracks.map((t) => t.id)).toEqual(['p-1', 'p-2']);
    expect(tracks[0].keyframes).toHaveLength(1);
  });

  it('입력이 시간순이 아니어도 정렬 후 처리', () => {
    const frames = [{ timeMs: 100, detections: [det(0.1, 0.1)] }, { timeMs: 0, detections: [det(0.1, 0.1)] }];
    expect(trackDetections(frames)[0].keyframes.map((k) => k.timeMs)).toEqual([0, 100]);
  });

  it('빈 입력', () => {
    expect(trackDetections([])).toEqual([]);
  });
});

describe('boxAt', () => {
  const kfs = [
    { timeMs: 0, x: 0, y: 0, w: 0.2, h: 0.2 },
    { timeMs: 100, x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
  ];
  it('사이는 선형 보간', () => {
    expect(boxAt(kfs, 50)).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });
  it('정확히 키프레임', () => {
    expect(boxAt(kfs, 0)).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
    expect(boxAt(kfs, 100)).toEqual({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 });
  });
  it('양 끝은 holdMs 안에서만 유지', () => {
    expect(boxAt(kfs, 130, 50)).not.toBeNull();
    expect(boxAt(kfs, 200, 50)).toBeNull();
    expect(boxAt(kfs, -30, 50)).not.toBeNull();
    expect(boxAt(kfs, -80, 50)).toBeNull();
  });
  it('많은 키프레임에서 이진 탐색', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ timeMs: i * 10, x: i / 100, y: 0, w: 0.1, h: 0.1 }));
    expect(boxAt(many, 555)!.x).toBeCloseTo(0.555);
  });
  it('같은 시각 키프레임', () => {
    const dup = [{ timeMs: 0, x: 0, y: 0, w: 1, h: 1 }, { timeMs: 0, x: 0.5, y: 0, w: 1, h: 1 }, { timeMs: 10, x: 0.5, y: 0, w: 1, h: 1 }];
    expect(boxAt(dup, 0)).not.toBeNull();
  });
  it('빈 키프레임', () => {
    expect(boxAt([], 0)).toBeNull();
  });
});

describe('보조 함수', () => {
  it('scaleBox는 중심 유지 + 화면 안으로 자르기', () => {
    const b = scaleBox({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1.5);
    expect(b.x).toBeCloseTo(0.35);
    expect(b.w).toBeCloseTo(0.3);
    const edge = scaleBox({ x: 0, y: 0.9, w: 0.2, h: 0.1 }, 2);
    expect(edge.x).toBe(0);
    expect(edge.y + edge.h).toBeCloseTo(1);
  });
  it('lerpBox / trackSpan', () => {
    expect(lerpBox({ x: 0, y: 0, w: 0, h: 0 }, { x: 1, y: 1, w: 1, h: 1 }, 0.5)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(trackSpan([{ timeMs: 5 }, { timeMs: 50 }])).toEqual({ startMs: 5, endMs: 50 });
    expect(trackSpan([])).toEqual({ startMs: 0, endMs: 0 });
  });
});
