// GIF 인코더 (순수 TS). GIF 변환에 ffmpeg.wasm(30MB+)을 매번 내려받게 하지 않으려고 직접 구현했다.
// 팔레트는 여러 프레임 샘플로 median-cut 한 번만 만들고(전역 팔레트), 프레임마다 LZW로 압축한다.

export type Rgb = [number, number, number];

const BITS = 5;
const BIN = 1 << BITS;

/** RGBA 샘플들로 최대 maxColors색 팔레트를 만든다 (5비트 히스토그램 + median cut) */
export function buildPalette(samples: readonly Uint8ClampedArray[], maxColors = 256, step = 4): Rgb[] {
  const hist = new Uint32Array(BIN * BIN * BIN);
  for (const rgba of samples) {
    for (let i = 0; i < rgba.length; i += 4 * step) {
      hist[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++;
    }
  }
  const bins: number[] = [];
  for (let i = 0; i < hist.length; i++) if (hist[i] > 0) bins.push(i);
  if (bins.length === 0) return [[0, 0, 0]];

  const ch = (bin: number, c: number) => (bin >> (10 - c * 5)) & 31;
  let boxes: number[][] = [bins];
  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestScore = 0;
    let bestChannel = 0;
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 31;
        let hi = 0;
        let count = 0;
        for (const b of box) {
          const v = ch(b, c);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          count += hist[b];
        }
        const score = (hi - lo) * Math.sqrt(count);
        if (score > bestScore) { bestScore = score; bestIdx = idx; bestChannel = c; }
      }
    });
    if (bestIdx < 0) break;
    const box = [...boxes[bestIdx]].sort((a, b) => ch(a, bestChannel) - ch(b, bestChannel));
    const total = box.reduce((a, b) => a + hist[b], 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += hist[box[i]];
      if (acc >= total / 2) { cut = i + 1; break; }
      cut = i + 1;
    }
    boxes = [...boxes.slice(0, bestIdx), box.slice(0, cut), box.slice(cut), ...boxes.slice(bestIdx + 1)];
  }

  return boxes.map((box) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const bin of box) {
      const w = hist[bin];
      r += (ch(bin, 0) * 8 + 4) * w;
      g += (ch(bin, 1) * 8 + 4) * w;
      b += (ch(bin, 2) * 8 + 4) * w;
      n += w;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)] as Rgb;
  });
}

/** 팔레트 매핑. 같은 15비트 색은 캐시해서 프레임마다 최근접 탐색을 반복하지 않는다 */
export function createMapper(palette: readonly Rgb[]): (rgba: Uint8ClampedArray) => Uint8Array {
  const cache = new Int16Array(BIN * BIN * BIN).fill(-1);
  return (rgba) => {
    const out = new Uint8Array(rgba.length / 4);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
      let idx = cache[key];
      if (idx < 0) {
        let best = Infinity;
        idx = 0;
        for (let c = 0; c < palette.length; c++) {
          const dr = palette[c][0] - rgba[i];
          const dg = palette[c][1] - rgba[i + 1];
          const db = palette[c][2] - rgba[i + 2];
          const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (d < best) { best = d; idx = c; }
        }
        cache[key] = idx;
      }
      out[p] = idx;
    }
    return out;
  };
}

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  length = 0;
  byte(v: number) {
    if (this.length >= this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = v & 0xff;
  }
  u16(v: number) { this.byte(v); this.byte(v >> 8); }
  bytes(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
  result() { return this.buf.slice(0, this.length); }
}

/** GIF LZW (omggif의 코드 크기 증가 규칙과 동일) */
function lzw(out: ByteWriter, minCodeSize: number, indices: Uint8Array): void {
  out.byte(minCodeSize);
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;
  let table = new Map<number, number>();
  let cur = 0;
  let curShift = 0;
  const block: number[] = [];

  const emitBytesIfFull = () => {
    while (curShift >= 8) {
      block.push(cur & 0xff);
      cur >>>= 8;
      curShift -= 8;
      if (block.length === 255) { out.byte(255); out.bytes(block); block.length = 0; }
    }
  };
  const emit = (code: number) => { cur |= code << curShift; curShift += codeSize; emitBytesIfFull(); };

  emit(clearCode);
  let ib = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (ib << 8) | k;
    const found = table.get(key);
    if (found !== undefined) { ib = found; continue; }
    emit(ib);
    if (nextCode === 4096) {
      emit(clearCode);
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
      table = new Map();
    } else {
      if (nextCode >= 1 << codeSize) codeSize++;
      table.set(key, nextCode++);
    }
    ib = k;
  }
  emit(ib);
  emit(eoiCode);
  if (curShift > 0) { block.push(cur & 0xff); cur = 0; curShift = 0; }
  for (let i = 0; i < block.length; i += 255) {
    const chunk = block.slice(i, i + 255);
    out.byte(chunk.length);
    out.bytes(chunk);
  }
  out.byte(0);
}

export class GifEncoder {
  private readonly out = new ByteWriter();
  private readonly map: (rgba: Uint8ClampedArray) => Uint8Array;
  private finished = false;

  constructor(readonly width: number, readonly height: number, palette: readonly Rgb[], loop = 0) {
    const table = [...palette];
    while (table.length < 256) table.push([0, 0, 0]);
    this.map = createMapper(palette);
    const o = this.out;
    o.bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    o.u16(width);
    o.u16(height);
    o.byte(0xf7); // 전역 색상표 있음, 256색
    o.byte(0);
    o.byte(0);
    for (const [r, g, b] of table.slice(0, 256)) { o.byte(r); o.byte(g); o.byte(b); }
    // NETSCAPE2.0 반복 확장
    o.bytes([0x21, 0xff, 0x0b]);
    o.bytes(Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)));
    o.bytes([0x03, 0x01]);
    o.u16(loop);
    o.byte(0);
  }

  addFrame(rgba: Uint8ClampedArray, delayMs: number): void {
    if (this.finished) throw new Error('GifEncoder: finish() 이후에는 프레임을 추가할 수 없습니다');
    const o = this.out;
    o.bytes([0x21, 0xf9, 0x04, 0x00]);
    o.u16(Math.max(2, Math.round(delayMs / 10)));
    o.byte(0);
    o.byte(0);
    o.byte(0x2c);
    o.u16(0);
    o.u16(0);
    o.u16(this.width);
    o.u16(this.height);
    o.byte(0);
    lzw(o, 8, this.map(rgba));
  }

  finish(): Uint8Array {
    if (!this.finished) { this.out.byte(0x3b); this.finished = true; }
    return this.out.result();
  }
}
