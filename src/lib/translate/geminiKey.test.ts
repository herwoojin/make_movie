import { describe, expect, it } from 'vitest';
import { keyCandidates, keyShapeProblem, maskKey } from './geminiKey';

const A = `AIza${'a'.repeat(35)}`;
const B = `AIza${'b'.repeat(35)}`;

describe('keyCandidates', () => {
  it('공백·줄바꿈·따옴표·보이지 않는 글자를 지운다', () => {
    expect(keyCandidates(` "${A}"\n`)).toEqual([A]);
    expect(keyCandidates(`​${A}﻿`)).toEqual([A]);
  });
  it('이어 붙은 키는 마지막에 붙여넣은 것부터', () => {
    expect(keyCandidates(`${A}${B}`)).toEqual([B, A]);
    expect(keyCandidates(`${A} ${A}`)).toEqual([A]);
  });
  it('주소째 붙여넣거나 이름표가 붙어 있어도 키만 꺼낸다', () => {
    expect(keyCandidates(`https://generativelanguage.googleapis.com/v1beta/models?key=${A}`)).toEqual([A]);
    expect(keyCandidates(`GEMINI_API_KEY=${A}`)).toEqual([A]);
  });
  it('키 모양을 못 찾으면 정리한 값을 그대로 (구글이 형식을 바꿔도 막지 않는다)', () => {
    expect(keyCandidates(' some-new-format-key ')).toEqual(['some-new-format-key']);
    expect(keyCandidates('  ')).toEqual([]);
  });
});

describe('keyShapeProblem', () => {
  it('정상 키는 문제 없음', () => {
    expect(keyShapeProblem(A)).toBeNull();
    expect(keyShapeProblem('')).toBeNull();
  });
  it('이어 붙은 키·다른 서비스 키·잘린 키를 알려 준다', () => {
    expect(keyShapeProblem(`${A}${B}`)).toContain('2개 이어 붙어');
    expect(keyShapeProblem('gsk_abcdef')).toContain('Groq');
    expect(keyShapeProblem('abcd-1234:fx')).toContain('DeepL');
    expect(keyShapeProblem('AIzaShort')).toContain('9자');
    expect(keyShapeProblem('my-project-123')).toContain('AIza로 시작');
  });
});

describe('maskKey', () => {
  it('앞 4자·끝 4자만 보여 준다', () => {
    expect(maskKey(B)).toBe('AIza…bbbb');
    expect(maskKey('short')).toBe('••••');
    expect(maskKey('')).toBe('');
  });
});
