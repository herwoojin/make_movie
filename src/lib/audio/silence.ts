// 무음 자동 컷 (TRD 4.2). STT 없이 오디오 에너지만 본다 — 빠르고 무료이며 이 앱의 핵심 기능이다.
import type { CutSuggestion, TimeRange } from '@/types/models';

export interface SilenceParams {
  thresholdDb: number;   // 기본 -35
  minSilenceMs: number;  // 기본 500 — 이보다 짧은 무음은 무시
  paddingMs: number;     // 기본 200 — 컷 앞뒤로 남길 여유
  minKeepMs: number;     // 기본 300 — 이보다 짧은 유지구간은 앞뒤와 병합
}

// 기본값은 보수적으로: 잘못 자르는 것이 덜 자르는 것보다 신뢰를 더 크게 잃는다 (PRD 8장)
export const DEFAULT_SILENCE_PARAMS: SilenceParams = {
  thresholdDb: -35, minSilenceMs: 500, paddingMs: 200, minKeepMs: 300,
};

export const FRAME_MS = 20;
/** 진입(threshold)과 이탈(threshold+3dB)을 다르게 둬서 경계에서 컷이 잘게 쪼개지는 것을 막는다 */
export const HYSTERESIS_DB = 3;
const FLOOR_DB = -120;

/** 1~2단계: 20ms 프레임 RMS → dBFS */
export function frameLevelsDb(pcm: Float32Array, sampleRate: number, frameMs = FRAME_MS): Float32Array {
  const frameSamples = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const frames = Math.ceil(pcm.length / frameSamples);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * frameSamples;
    const end = Math.min(start + frameSamples, pcm.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / (end - start));
    out[f] = rms > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(rms)) : FLOOR_DB;
  }
  return out;
}

interface RawSilence extends TimeRange { meanDb: number }

/** 3~6단계: 레벨 배열에서 잘라낼 구간 계산 (PCM 없이도 테스트·재계산 가능하게 분리) */
export function detectSilenceRanges(
  levels: Float32Array, frameMs: number, totalMs: number, params: SilenceParams,
): RawSilence[] {
  const enter = params.thresholdDb;
  const exit = params.thresholdDb + HYSTERESIS_DB;

  // 3) 히스테리시스 상태 기계
  const raw: RawSilence[] = [];
  let startFrame = -1;
  let dbSum = 0;
  const close = (endFrame: number) => {
    const startMs = startFrame * frameMs;
    const endMs = Math.min(endFrame * frameMs, totalMs);
    raw.push({ startMs, endMs, meanDb: dbSum / Math.max(1, endFrame - startFrame) });
    startFrame = -1;
    dbSum = 0;
  };
  for (let f = 0; f < levels.length; f++) {
    const db = levels[f];
    if (startFrame < 0) {
      if (db < enter) { startFrame = f; dbSum = db; }
    } else if (db > exit) {
      close(f);
    } else {
      dbSum += db;
    }
  }
  if (startFrame >= 0) close(levels.length);

  // 4) 최소 무음 길이  5) 앞뒤 여백 — 파일 맨 앞/맨 뒤에는 말소리가 없으니 여백을 두지 않는다
  const padded: RawSilence[] = [];
  for (const r of raw) {
    if (r.endMs - r.startMs < params.minSilenceMs) continue;
    const startMs = r.startMs <= 0 ? 0 : r.startMs + params.paddingMs;
    const endMs = r.endMs >= totalMs ? totalMs : r.endMs - params.paddingMs;
    if (endMs - startMs <= 0) continue;
    padded.push({ startMs, endMs, meanDb: r.meanDb });
  }

  // 6) 너무 짧은 유지구간은 앞뒤 컷과 합친다 (짧게 튀는 소리 하나 때문에 컷이 쪼개지지 않게)
  const merged: RawSilence[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startMs - last.endMs < params.minKeepMs) {
      last.meanDb = Math.min(last.meanDb, r.meanDb);
      last.endMs = r.endMs;
    } else {
      merged.push({ ...r });
    }
  }
  const first = merged[0];
  if (first && first.startMs > 0 && first.startMs < params.minKeepMs) first.startMs = 0;
  const last = merged[merged.length - 1];
  if (last && last.endMs < totalMs && totalMs - last.endMs < params.minKeepMs) last.endMs = totalMs;
  return merged;
}

/** 7단계: CutSuggestion[] 로 반환. 적용은 사용자가 확인한 뒤에. */
export function detectSilence(
  pcm: Float32Array, sampleRate: number, params: SilenceParams, projectId = '',
): CutSuggestion[] {
  if (pcm.length === 0 || sampleRate <= 0) return [];
  const totalMs = Math.round((pcm.length / sampleRate) * 1000);
  const levels = frameLevelsDb(pcm, sampleRate, FRAME_MS);
  return rangesToSuggestions(detectSilenceRanges(levels, FRAME_MS, totalMs, params), params, projectId);
}

export function rangesToSuggestions(ranges: RawSilence[], params: SilenceParams, projectId = ''): CutSuggestion[] {
  return ranges.map((r) => ({
    // 위치 기반 id: 슬라이더로 재계산해도 같은 구간이면 사용자의 살리기/자르기 선택이 유지된다
    id: `silence-${r.startMs}-${r.endMs}`,
    projectId,
    startMs: Math.round(r.startMs),
    endMs: Math.round(r.endMs),
    source: 'silence' as const,
    confidence: Math.min(1, Math.max(0, (params.thresholdDb - r.meanDb) / 30)),
    decision: 'pending' as const,
  }));
}
