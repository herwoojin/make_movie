import { describe, expect, it } from 'vitest';
import { looksUntranslated } from './prompt';

describe('looksUntranslated', () => {
  it('원문을 베낀 일본어·중국어, 가나가 섞인 줄, 빈 줄은 번역이 아니다', () => {
    expect(looksUntranslated('おっとで、OKな', 'おっとで、OKな')).toBe(true);
    expect(looksUntranslated('你好', '你好')).toBe(true);
    expect(looksUntranslated('こんにちは', '안녕 こんにちは')).toBe(true);
    expect(looksUntranslated('こんにちは', '  ')).toBe(true);
  });

  it('줄이 밀려 괄호 같은 부스러기만 오면 번역이 아니다', () => {
    expect(looksUntranslated('っとで、OKな', '(')).toBe(true);
    expect(looksUntranslated('♪', '♪')).toBe(false);
  });

  it('한국어이거나, 원래 그대로 쓰는 짧은 외국어는 번역으로 본다', () => {
    expect(looksUntranslated('こんにちは', '안녕하세요')).toBe(false);
    expect(looksUntranslated('東京タワー', '도쿄 타워(東京)')).toBe(false);
    expect(looksUntranslated('OK', 'OK')).toBe(false);
    expect(looksUntranslated('iPhone 15', 'iPhone 15')).toBe(false);
    expect(looksUntranslated('Thank you very much', 'Thank you very much')).toBe(true);
  });
});
