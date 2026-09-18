import { describe, expect, it } from 'vitest';
import { applyGlossary, formatGlossary, parseGlossary, relevantTerms } from './glossary';
import { buildReviewPrompt, buildTranslatePrompt, chunk, parseJsonArray } from './prompt';

describe('parseGlossary', () => {
  it('쉼표·줄바꿈·콜론·화살표를 모두 받는다', () => {
    expect(parseGlossary('Sunburst=선버스트, fidelity=정확도')).toEqual({ Sunburst: '선버스트', fidelity: '정확도' });
    expect(parseGlossary('A: 가\nB → 나')).toEqual({ A: '가', B: '나' });
  });
  it('형식이 어긋난 줄은 건너뛴다', () => {
    expect(parseGlossary('그냥 글자\n=빈키\nC=다')).toEqual({ C: '다' });
    expect(parseGlossary('')).toEqual({});
  });
  it('다시 문자열로 되돌릴 수 있다', () => {
    expect(formatGlossary({ A: '가', B: '나' })).toBe('A=가, B=나');
  });
});

describe('applyGlossary', () => {
  it('대소문자를 가리지 않고 바꾼다', () => {
    expect(applyGlossary('SUNBURST와 sunburst', { Sunburst: '선버스트' })).toBe('선버스트와 선버스트');
  });
  it('단어 가운데는 바꾸지 않는다', () => {
    expect(applyGlossary('infidelity는 fidelity가 아니다', { fidelity: '정확도' })).toBe('infidelity는 정확도가 아니다');
  });
  it('긴 용어를 먼저 바꾼다', () => {
    expect(applyGlossary('GPT Image 2.5', { GPT: '지피티', 'GPT Image': 'GPT 이미지' })).toBe('GPT 이미지 2.5');
  });
  it('한글 사이에 낀 원어도 경계를 지킨다', () => {
    expect(applyGlossary('오늘 Sunburst를 씁니다', { Sunburst: '선버스트' })).toBe('오늘 선버스트를 씁니다');
  });
});

describe('relevantTerms', () => {
  it('문장에 나온 용어만 추린다', () => {
    expect(relevantTerms(['we use Sunburst'], { Sunburst: '선버스트', fidelity: '정확도' })).toEqual({ Sunburst: '선버스트' });
  });
});

describe('프롬프트', () => {
  it('용어·말투·개수를 넣는다', () => {
    const p = buildTranslatePrompt(['hello', 'Sunburst'], { sourceLang: 'en', tone: 'formal', glossary: { Sunburst: '선버스트' } });
    expect(p).toContain('Sunburst=선버스트');
    expect(p).toContain('합쇼체');
    expect(p).toContain('2개');
  });
  it('재검수 프롬프트는 앞 문맥을 참고로만 준다', () => {
    const p = buildReviewPrompt([{ text: 'a', translated: '가' }], { tone: 'friendly', glossary: {}, contextBefore: ['앞줄'] });
    expect(p).toContain('참고만');
    expect(p).toContain('1개');
  });
});

describe('parseJsonArray', () => {
  it('울타리와 설명이 붙어도 배열만 꺼낸다', () => {
    expect(parseJsonArray('```json\n["가","나"]\n```', 2)).toEqual(['가', '나']);
    expect(parseJsonArray('결과입니다:\n["가","나"]', 2)).toEqual(['가', '나']);
  });
  it('객체 배열이면 번역 항목을 꺼낸다', () => {
    expect(parseJsonArray('[{"번역":"가"},{"translated":"나"}]', 2)).toEqual(['가', '나']);
  });
  it('개수가 많으면 앞에서 자르고, 아예 배열이 아니면 null', () => {
    expect(parseJsonArray('["가","나","다"]', 2)).toEqual(['가', '나']);
    expect(parseJsonArray('그냥 문장', 2)).toBeNull();
  });
});

describe('chunk', () => {
  it('묶음으로 나눈다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
