// 자동 더킹 (F-06-5): 말하는 구간에서 배경음악을 낮춘다.
// 발화 판정은 무음 감지와 같은 프레임 레벨(frameLevelsDb)을 그대로 쓴다 — 새로 짜지 않는다.
import { FRAME_MS } from './silence';

export interface DuckOptions {
  /** 이 레벨(dB)보다 크면 말하는 중으로 본다 */
  thresholdDb: number;
  /** 낮출 크기 (dB, 양수) */
  reductionDb: number;
  /** 낮아지는 데 걸리는 시간 */
  attackMs: number;
  /** 원래대로 돌아오는 데 걸리는 시간 */
  releaseMs: number;
  frameMs?: number;
}

export const DEFAULT_DUCK: DuckOptions = {
  thresholdDb: -35,
  reductionDb: 12,
  attackMs: 100,
  releaseMs: 300,
};

export const dbToGain = (db: number): number => 10 ** (db / 20);

/**
 * 프레임별 목표 게인(0~1)을 만든다.
 * 말하는 프레임에서는 -reductionDb까지 내려가고, 끝나면 releaseMs에 걸쳐 1로 돌아온다.
 */
export function duckGainCurve(levelsDb: Float32Array, opts: DuckOptions = DEFAULT_DUCK): Float32Array {
  const frameMs = opts.frameMs ?? FRAME_MS;
  const low = dbToGain(-Math.abs(opts.reductionDb));
  const attackStep = frameMs / Math.max(frameMs, opts.attackMs);
  const releaseStep = frameMs / Math.max(frameMs, opts.releaseMs);
  const out = new Float32Array(levelsDb.length);
  let gain = 1;
  for (let i = 0; i < levelsDb.length; i++) {
    const target = levelsDb[i] > opts.thresholdDb ? low : 1;
    // 내려갈 때는 attack, 올라올 때는 release 속도로 따라간다
    const step = target < gain ? attackStep : releaseStep;
    gain += (target - gain) * Math.min(1, step);
    out[i] = gain;
  }
  return out;
}

/** 게인 곡선을 Web Audio 자동화에 넣기 좋은 (시간, 값) 목록으로 */
export function gainAutomationPoints(curve: Float32Array, frameMs = FRAME_MS, epsilon = 0.01): { timeSec: number; value: number }[] {
  const points: { timeSec: number; value: number }[] = [];
  let last = Number.NaN;
  for (let i = 0; i < curve.length; i++) {
    if (!Number.isFinite(last) || Math.abs(curve[i] - last) >= epsilon || i === curve.length - 1) {
      points.push({ timeSec: (i * frameMs) / 1000, value: curve[i] });
      last = curve[i];
    }
  }
  return points;
}
