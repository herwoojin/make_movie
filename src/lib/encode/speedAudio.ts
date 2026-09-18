// 배속이 걸린 구간의 소리를 다시 샘플링한다 (F-05).
// 음정은 함께 바뀐다 — 음정을 유지하려면 ffmpeg atempo 경로로 간다(TASK 결정 기록 참고).
// 스트리밍이라 20분치 PCM을 한 번에 들고 있지 않는다.
import type { SpeedRange } from '@/lib/core/edl';

export interface SpeedSpanSamples {
  start: number;
  end: number;
  speed: number;
}

/** 배속 구간(ms, 컷 적용 후·배속 적용 전 시간)을 샘플 번호로 */
export function speedSpansToSamples(spans: readonly SpeedRange[], sampleRate: number): SpeedSpanSamples[] {
  return spans
    .map((s) => ({ start: Math.round((s.startMs * sampleRate) / 1000), end: Math.round((s.endMs * sampleRate) / 1000), speed: s.speed }))
    .filter((s) => s.end > s.start);
}

export function hasSpeedChange(spans: readonly SpeedRange[], defaultSpeed = 1): boolean {
  return defaultSpeed !== 1 || spans.some((s) => s.speed !== 1 && s.endMs > s.startMs);
}

export class VariableSpeedResampler {
  /** 다음에 읽을 입력 위치 (샘플, 소수 포함) */
  private cursor = 0;
  /** 버퍼 첫 샘플의 절대 위치 */
  private bufStart = 0;
  private buf: Float32Array[] | null = null;

  constructor(
    private readonly spans: readonly SpeedSpanSamples[],
    private readonly channels: number,
    private readonly defaultSpeed = 1,
  ) {}

  private speedAt(sample: number): number {
    for (const s of this.spans) {
      if (sample >= s.start && sample < s.end) return s.speed > 0 ? s.speed : 1;
    }
    return this.defaultSpeed > 0 ? this.defaultSpeed : 1;
  }

  /** planes를 순서대로 넣는다. 배속이 반영된 PCM을 돌려준다 */
  process(planes: readonly Float32Array[]): Float32Array[] {
    const incoming = planes[0]?.length ?? 0;
    if (incoming === 0) return this.channels > 0 ? Array.from({ length: this.channels }, () => new Float32Array(0)) : [];

    // 직전 조각의 마지막 샘플 하나를 앞에 붙여 조각 경계에서도 보간이 이어지게 한다
    const carry = this.buf ? 1 : 0;
    const buf = Array.from({ length: this.channels }, (_, c) => {
      const next = new Float32Array(carry + incoming);
      if (carry && this.buf) next[0] = this.buf[c][this.buf[c].length - 1];
      next.set(planes[c] ?? new Float32Array(incoming), carry);
      return next;
    });
    const bufStart = this.bufStart + (this.buf ? this.buf[0].length - carry : 0);
    this.buf = buf;
    this.bufStart = bufStart;

    const last = bufStart + buf[0].length - 1;
    const out: number[][] = Array.from({ length: this.channels }, () => []);
    if (this.cursor < bufStart) this.cursor = bufStart;
    while (this.cursor < last) {
      const i = Math.floor(this.cursor);
      const frac = this.cursor - i;
      const a = i - bufStart;
      for (let c = 0; c < this.channels; c++) {
        const p = buf[c];
        out[c].push(p[a] * (1 - frac) + p[a + 1] * frac);
      }
      this.cursor += this.speedAt(i);
    }
    return out.map((v) => Float32Array.from(v));
  }
}
