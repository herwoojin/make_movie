import { describe, expect, it } from 'vitest';
import { encodeWav, samplesPerWavChunk } from './wav';

describe('wav', () => {
  it('헤더와 샘플 값', () => {
    const buf = encodeWav([new Float32Array([0, 1, -1, 2])], 16000);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 8);
    expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });
  it('스테레오 인터리브', () => {
    const buf = encodeWav([new Float32Array([1]), new Float32Array([-1])], 44100);
    const v = new DataView(buf);
    expect(v.getUint16(22, true)).toBe(2);
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([32767, -32768]);
  });
  it('청크 크기', () => {
    expect(samplesPerWavChunk(44 + 200)).toBe(100);
    expect(samplesPerWavChunk(10)).toBe(1);
  });
});
