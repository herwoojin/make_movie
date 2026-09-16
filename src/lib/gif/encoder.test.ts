import { describe, expect, it } from 'vitest';
import { buildPalette, createMapper, GifEncoder } from './encoder';

/** 테스트용 최소 GIF 디코더: 첫 프레임의 인덱스 배열을 복원해 LZW 왕복을 검증한다 */
function decodeFirstFrame(gif: Uint8Array, w: number, h: number): Uint8Array {
  let p = 13 + 256 * 3;
  while (gif[p] !== 0x2c) {
    if (gif[p] === 0x21) {
      p += 2;
      while (gif[p] !== 0) p += gif[p] + 1;
      p += 1;
    } else throw new Error(`unexpected ${gif[p]}`);
  }
  p += 10;
  const minCode = gif[p++];
  const data: number[] = [];
  while (gif[p] !== 0) { const n = gif[p++]; for (let i = 0; i < n; i++) data.push(gif[p++]); }

  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = minCode + 1; };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++) {
      const byte = data[(bitPos + i) >> 3] ?? 0;
      code |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += size;
    return code;
  };
  let prev: number[] | null = null;
  for (;;) {
    const code = read();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry: number[];
    if (dict[code]) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('bad code');
    out.push(...entry);
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << size && size < 12) size++;
    }
    prev = entry;
  }
  return Uint8Array.from(out.slice(0, w * h));
}

function image(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * w + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  return px;
}

describe('gif encoder', () => {
  it('팔레트: 색이 적으면 그 색들로', () => {
    const img = image(4, 4, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
    const pal = buildPalette([img], 256, 1);
    expect(pal).toHaveLength(2);
    expect(pal.some(([r, , b]) => r > 240 && b < 10)).toBe(true);
  });

  it('팔레트: 색이 많으면 maxColors로 줄인다, 빈 샘플은 검정 1색', () => {
    const img = image(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2]);
    expect(buildPalette([img], 16, 1).length).toBeLessThanOrEqual(16);
    expect(buildPalette([], 16)).toEqual([[0, 0, 0]]);
  });

  it('매퍼는 최근접 팔레트 인덱스', () => {
    const map = createMapper([[0, 0, 0], [255, 255, 255]]);
    expect(Array.from(map(new Uint8ClampedArray([10, 10, 10, 255, 250, 250, 250, 255])))).toEqual([0, 1]);
  });

  it('LZW 왕복: 코드 크기 증가와 테이블 리셋(4096)을 지나도 복원된다', () => {
    const w = 120;
    const h = 120;
    const img = image(w, h, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * y) % 256]);
    const pal = buildPalette([img], 256, 1);
    const enc = new GifEncoder(w, h, pal);
    enc.addFrame(img, 100);
    enc.addFrame(img, 100);
    const gif = enc.finish();
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(gif[gif.length - 1]).toBe(0x3b);
    const decoded = decodeFirstFrame(gif, w, h);
    expect(Array.from(decoded)).toEqual(Array.from(createMapper(pal)(img)));
  });

  it('finish 이후 addFrame은 에러, finish는 멱등', () => {
    const enc = new GifEncoder(1, 1, [[0, 0, 0]]);
    const a = enc.finish();
    expect(enc.finish()).toEqual(a);
    expect(() => enc.addFrame(new Uint8ClampedArray(4), 10)).toThrow();
  });
});
