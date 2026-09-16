// 파형 피크. PCM 전체를 들고 다니면 20분에 수십 MB라, 초당 100포인트 min/max로 줄여 그린다.

export const PEAKS_PER_SECOND = 100;

/** [min, max, min, max, ...] 를 -128~127로 정규화한 Int8Array */
export function computePeaks(pcm: Float32Array, sampleRate: number, pointsPerSecond = PEAKS_PER_SECOND): Int8Array<ArrayBuffer> {
  const samplesPerPoint = Math.max(1, Math.round(sampleRate / pointsPerSecond));
  const points = Math.ceil(pcm.length / samplesPerPoint);
  const out = new Int8Array(points * 2);
  for (let p = 0; p < points; p++) {
    const start = p * samplesPerPoint;
    const end = Math.min(start + samplesPerPoint, pcm.length);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = pcm[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[p * 2] = toInt8(min);
    out[p * 2 + 1] = toInt8(max);
  }
  return out;
}

function toInt8(v: number): number {
  return Math.max(-128, Math.min(127, Math.round(v * 127)));
}

export function peakCount(peaks: Int8Array): number {
  return peaks.length >> 1;
}

/** 줌 아웃 시 여러 포인트를 하나로 합친다 (min의 min, max의 max) */
export function downsamplePeaks(peaks: Int8Array, factor: number): Int8Array {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return peaks;
  const n = Math.ceil(peakCount(peaks) / f);
  const out = new Int8Array(n * 2);
  for (let p = 0; p < n; p++) {
    let min = 127;
    let max = -128;
    const end = Math.min((p + 1) * f, peakCount(peaks));
    for (let i = p * f; i < end; i++) {
      if (peaks[i * 2] < min) min = peaks[i * 2];
      if (peaks[i * 2 + 1] > max) max = peaks[i * 2 + 1];
    }
    out[p * 2] = min;
    out[p * 2 + 1] = max;
  }
  return out;
}
