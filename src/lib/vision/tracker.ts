// 프레임 간 얼굴 추적 (TRD 4.5). 검출은 5프레임마다만 하므로, 샘플 사이를 이어 붙이는 것이 이 모듈의 몫이다.
// 좌표는 전부 0~1 정규화 — 어떤 해상도로 내보내도 그대로 쓴다.

export interface Box { x: number; y: number; w: number; h: number }
export interface Detection extends Box { score: number }
export interface FrameDetections { timeMs: number; detections: Detection[] }
export interface TrackKeyframe extends Box { timeMs: number; score: number; interpolated: boolean }
export interface TrackResult { id: string; keyframes: TrackKeyframe[] }

export interface TrackerOptions {
  iouThreshold: number;  // 이보다 크게 겹치면 같은 인물
  maxMisses: number;     // 연속 미검출 허용 샘플 수 — 넘으면 트랙 종료
  idPrefix: string;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = { iouThreshold: 0.3, maxMisses: 3, idPrefix: 'person' };

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function lerpBox(a: Box, b: Box, t: number): Box {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

interface ActiveTrack { result: TrackResult; misses: number; missedTimes: number[] }

/**
 * IoU 그리디 매칭을 샘플 프레임이 들어오는 대로 수행한다(스캔 도중 인물별 대표 썸네일을 고르기 위해 점진 방식).
 * 한 번 끝난 트랙은 되살리지 않는다 — 서로 다른 사람을 한 명으로 합치는 오탐보다
 * 한 사람이 두 트랙으로 나뉘는 쪽이 사용자가 고치기 쉽다.
 */
export class OnlineTracker {
  private readonly o: TrackerOptions;
  private readonly finished: TrackResult[] = [];
  private active: ActiveTrack[] = [];
  private nextId = 1;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.o = { ...DEFAULT_TRACKER_OPTIONS, ...opts };
  }

  /** 반환: 각 검출이 배정된 트랙 id (detections와 같은 순서) */
  push(frame: FrameDetections): string[] {
    const assigned = new Array<string>(frame.detections.length);
    const pairs: { t: number; d: number; score: number }[] = [];
    this.active.forEach((track, t) => {
      const last = track.result.keyframes[track.result.keyframes.length - 1];
      frame.detections.forEach((det, d) => {
        const score = iou(last, det);
        if (score > this.o.iouThreshold) pairs.push({ t, d, score });
      });
    });
    pairs.sort((a, b) => b.score - a.score);

    const usedT = new Set<number>();
    const usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.t) || usedD.has(p.d)) continue;
      usedT.add(p.t);
      usedD.add(p.d);
      const track = this.active[p.t];
      const det = frame.detections[p.d];
      fillMissed(track, det);
      track.result.keyframes.push(toKeyframe(frame.timeMs, det));
      track.misses = 0;
      track.missedTimes = [];
      assigned[p.d] = track.result.id;
    }

    const survivors: ActiveTrack[] = [];
    this.active.forEach((track, t) => {
      if (usedT.has(t)) { survivors.push(track); return; }
      track.misses += 1;
      track.missedTimes.push(frame.timeMs);
      if (track.misses >= this.o.maxMisses) this.finished.push(track.result);
      else survivors.push(track);
    });

    frame.detections.forEach((det, d) => {
      if (usedD.has(d)) return;
      const id = `${this.o.idPrefix}-${this.nextId++}`;
      survivors.push({ result: { id, keyframes: [toKeyframe(frame.timeMs, det)] }, misses: 0, missedTimes: [] });
      assigned[d] = id;
    });
    this.active = survivors;
    return assigned;
  }

  finish(): TrackResult[] {
    const all = [...this.finished, ...this.active.map((t) => t.result)];
    this.active = [];
    return all.sort((a, b) => a.keyframes[0].timeMs - b.keyframes[0].timeMs);
  }
}

export function trackDetections(frames: readonly FrameDetections[], opts: Partial<TrackerOptions> = {}): TrackResult[] {
  const tracker = new OnlineTracker(opts);
  for (const frame of [...frames].sort((a, b) => a.timeMs - b.timeMs)) tracker.push(frame);
  return tracker.finish();
}

/** 잠깐 놓쳤다가 다시 찾은 경우, 놓친 샘플 시각에 보간 키프레임을 채워 가림이 끊기지 않게 한다 */
function fillMissed(track: ActiveTrack, det: Detection): void {
  if (track.missedTimes.length === 0) return;
  const last = track.result.keyframes[track.result.keyframes.length - 1];
  const span = track.missedTimes.length + 1;
  track.missedTimes.forEach((timeMs, i) => {
    const box = lerpBox(last, det, (i + 1) / span);
    track.result.keyframes.push({ ...box, timeMs, score: Math.min(last.score, det.score), interpolated: true });
  });
}

function toKeyframe(timeMs: number, det: Detection): TrackKeyframe {
  return { x: det.x, y: det.y, w: det.w, h: det.h, score: det.score, timeMs, interpolated: false };
}

/**
 * 렌더 시각의 박스. 키프레임 사이는 선형 보간, 양 끝은 holdMs 만큼 유지
 * (5프레임 샘플이라 첫 검출 직전·마지막 검출 직후 몇 프레임이 노출되는 것을 막는다).
 */
export function boxAt<T extends Box & { timeMs: number }>(keyframes: readonly T[], timeMs: number, holdMs = 0): Box | null {
  const n = keyframes.length;
  if (n === 0) return null;
  if (timeMs < keyframes[0].timeMs) return keyframes[0].timeMs - timeMs <= holdMs ? pick(keyframes[0]) : null;
  if (timeMs >= keyframes[n - 1].timeMs) return timeMs - keyframes[n - 1].timeMs <= holdMs ? pick(keyframes[n - 1]) : null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].timeMs <= timeMs) lo = mid;
    else hi = mid;
  }
  const a = keyframes[lo];
  const b = keyframes[hi];
  const t = b.timeMs === a.timeMs ? 0 : (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
  return lerpBox(a, b, t);
}

function pick(b: Box): Box {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/** 중심을 유지한 채 확대하고 화면 밖으로 나가지 않게 자른다 */
export function scaleBox(box: Box, scale: number): Box {
  const w = box.w * scale;
  const h = box.h * scale;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const x = Math.max(0, cx - w / 2);
  const y = Math.max(0, cy - h / 2);
  return { x, y, w: Math.min(1, cx + w / 2) - x, h: Math.min(1, cy + h / 2) - y };
}

export function trackSpan(keyframes: readonly { timeMs: number }[]): { startMs: number; endMs: number } {
  if (keyframes.length === 0) return { startMs: 0, endMs: 0 };
  return { startMs: keyframes[0].timeMs, endMs: keyframes[keyframes.length - 1].timeMs };
}
