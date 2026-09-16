import { describe, expect, it } from 'vitest';
import { crc32, createZip } from './zip';

describe('zip', () => {
  it('crc32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('구조: 로컬 헤더 → 데이터 → 중앙 디렉터리 → EOCD', () => {
    const a = new TextEncoder().encode('abc');
    const zip = createZip([{ name: '사진1.jpg', data: a }, { name: 'b.txt', data: new Uint8Array([1, 2]) }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const nameLen = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe('사진1.jpg');
    expect(Array.from(zip.slice(30 + nameLen, 33 + nameLen))).toEqual([97, 98, 99]);
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = v.getUint32(eocd + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(v.getUint32(cdOffset + 16, true)).toBe(crc32(a));
  });
});
