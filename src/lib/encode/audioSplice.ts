// 내보내기 오디오: 유지 구간만 이어 붙이고, 컷 경계에 5ms 크로스페이드를 넣어 '뚝' 소리를 없앤다.
// 스트리밍 방식 — 20분 48kHz 스테레오 PCM(약 460MB)을 한 번에 메모리에 올리지 않는다.
//
// 크로스페이드는 길이를 보존하도록 설계했다: A 구간의 마지막 N 샘플 자리에
// "A 꼬리(페이드아웃) + B 시작 직전 N 샘플(페이드인)"을 겹쳐 넣는다.
// 출력 길이가 유지 구간 길이의 합과 정확히 같으므로, 컷이 수백 개여도 영상과 싱크가 밀리지 않는다.
import type { TimeRange } from '@/types/models';

export interface SampleRange { start: number; end: number }

export const CROSSFADE_MS = 5;

export function msRangesToSamples(ranges: readonly TimeRange[], sampleRate: number): SampleRange[] {
  return ranges
    .map((r) => ({ start: Math.round((r.startMs * sampleRate) / 1000), end: Math.round((r.endMs * sampleRate) / 1000) }))
    .filter((r) => r.end > r.start);
}

export class AudioSplicer {
  private r = 0;
  private tail: Float32Array[] | null = null;
  private tailFill = 0;
  private pre: Float32Array[] | null = null;
  private preFill = 0;
  private collectingPre = false;

  constructor(
    private readonly ranges: readonly SampleRange[],
    private readonly channels: number,
    private readonly fade: number,
  ) {}

  /** 경계 i에서 크로스페이드가 가능한가: 양쪽 구간과 그 사이 틈이 모두 페이드 길이 이상일 때만 */
  private holdsTail(i: number): boolean {
    const a = this.ranges[i];
    const b = this.ranges[i + 1];
    return !!b && this.fade > 0 && a.end - a.start >= this.fade && b.end - b.start >= this.fade && b.start - a.end >= this.fade;
  }

  private alloc(): Float32Array[] {
    return Array.from({ length: this.channels }, () => new Float32Array(this.fade));
  }

  /** planes: 채널별 PCM, startSample: 이 조각의 원본 기준 첫 샘플 번호. 반환: 출력 순서대로 내보낼 조각들 */
  push(planes: readonly Float32Array[], startSample: number): Float32Array[][] {
    const out: Float32Array[][] = [];
    const len = planes[0]?.length ?? 0;
    const end = startSample + len;
    let pos = startSample;
    const slice = (from: number, to: number) => planes.map((p) => p.slice(from - startSample, to - startSample));
    const copyInto = (dest: Float32Array[], destOffset: number, from: number, to: number) => {
      for (let c = 0; c < this.channels; c++) dest[c].set(planes[c].subarray(from - startSample, to - startSample), destOffset);
    };

    while (pos < end && this.r < this.ranges.length) {
      const R = this.ranges[this.r];

      if (this.collectingPre && this.pre) {
        const preStart = R.start - this.fade;
        if (pos < preStart) { pos = Math.min(end, preStart); continue; }
        const to = Math.min(end, R.start);
        if (pos < to) {
          copyInto(this.pre, this.preFill, pos, to);
          this.preFill += to - pos;
          pos = to;
        }
        if (this.preFill >= this.fade) {
          out.push(this.mix());
          this.collectingPre = false;
        }
        continue;
      }

      if (pos < R.start) { pos = Math.min(end, R.start); continue; }
      if (pos >= R.end) {
        this.emitTailUnmixed(out);
        this.r++;
        continue;
      }
      const emitEnd = this.holdsTail(this.r) ? R.end - this.fade : R.end;
      if (pos < emitEnd) {
        const to = Math.min(end, emitEnd);
        out.push(slice(pos, to));
        pos = to;
        if (pos >= R.end) this.r++;
        continue;
      }
      if (!this.tail) { this.tail = this.alloc(); this.tailFill = 0; }
      const to = Math.min(end, R.end);
      copyInto(this.tail, this.tailFill, pos, to);
      this.tailFill += to - pos;
      pos = to;
      if (pos >= R.end) {
        this.r++;
        this.collectingPre = true;
        this.pre = this.alloc();
        this.preFill = 0;
      }
    }
    return out;
  }

  private mix(): Float32Array[] {
    const tail = this.tail ?? this.alloc();
    const pre = this.pre ?? this.alloc();
    const res = Array.from({ length: this.channels }, (_, c) => {
      const arr = new Float32Array(this.fade);
      for (let k = 0; k < this.fade; k++) {
        const w = (k + 0.5) / this.fade;
        arr[k] = tail[c][k] * (1 - w) + pre[c][k] * w;
      }
      return arr;
    });
    this.tail = null;
    this.pre = null;
    this.preFill = 0;
    return res;
  }

  private emitTailUnmixed(out: Float32Array[][]): void {
    if (!this.tail) return;
    const fill = this.tailFill;
    out.push(this.tail.map((t) => t.slice(0, fill)));
    this.tail = null;
    this.collectingPre = false;
    this.pre = null;
  }

  /** 입력이 끝났을 때 붙잡고 있던 꼬리를 내보낸다 */
  flush(): Float32Array[][] {
    const out: Float32Array[][] = [];
    this.emitTailUnmixed(out);
    return out;
  }
}

/** 스트리밍 선형 리샘플러. Opus(48kHz 고정)로만 인코딩 가능한 환경에서 44.1kHz 원본을 맞추기 위함 */
export class LinearResampler {
  private t = 0;
  private readonly carry: number[];
  private readonly ratio: number;

  constructor(inRate: number, outRate: number, private readonly channels: number) {
    this.ratio = inRate / outRate;
    this.carry = new Array<number>(channels).fill(0);
  }

  process(planes: readonly Float32Array[]): Float32Array[] {
    const n = planes[0]?.length ?? 0;
    if (n === 0) return planes.map(() => new Float32Array(0));
    const count = Math.max(0, Math.ceil((n - 1 - this.t) / this.ratio));
    const outs = Array.from({ length: this.channels }, () => new Float32Array(count));
    let t = this.t;
    for (let o = 0; o < count; o++) {
      const i0 = Math.floor(t);
      const frac = t - i0;
      for (let c = 0; c < this.channels; c++) {
        const a = i0 < 0 ? this.carry[c] : planes[c][i0];
        const b = planes[c][i0 + 1];
        outs[c][o] = a + (b - a) * frac;
      }
      t += this.ratio;
    }
    for (let c = 0; c < this.channels; c++) this.carry[c] = planes[c][n - 1];
    this.t = t - n;
    return outs;
  }
}

export function concatPlanes(chunks: readonly Float32Array[][], channels: number): Float32Array[] {
  const total = chunks.reduce((a, ch) => a + (ch[0]?.length ?? 0), 0);
  const out = Array.from({ length: channels }, () => new Float32Array(total));
  let off = 0;
  for (const ch of chunks) {
    for (let c = 0; c < channels; c++) out[c].set(ch[c], off);
    off += ch[0]?.length ?? 0;
  }
  return out;
}

/** f32-planar 버퍼 하나로 합치기 (AudioData 생성용) */
export function planarToBuffer(planes: readonly Float32Array[]): Float32Array<ArrayBuffer> {
  const n = planes[0]?.length ?? 0;
  const buf = new Float32Array(n * planes.length);
  planes.forEach((p, c) => buf.set(p, c * n));
  return buf;
}
