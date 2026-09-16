import { describe, expect, it } from 'vitest';
import type { WordLike } from '@/types/models';
import { DEFAULT_FILLERS, matchFillers, normalizeWord } from './fillers';

const w = (text: string, startMs: number, endMs: number): WordLike => ({ text, startMs, endMs });

describe('normalizeWord', () => {
  it('공백·문장부호 제거', () => {
    expect(normalizeWord(' 음,')).toBe('음');
    expect(normalizeWord('그래서 뭐?')).toBe('그래서뭐');
    expect(normalizeWord('Um...')).toBe('um');
  });
});

describe('기본 사전', () => {
  it("'그', '저', '뭐'는 기본 비활성", () => {
    const off = DEFAULT_FILLERS.filter((f) => !f.enabled).map((f) => f.word);
    expect(off.sort()).toEqual(['그', '뭐', '저']);
  });
});

describe('matchFillers', () => {
  it("'음' 매칭됨 (앞뒤 30ms 여백, 이웃과 먼 경우)", () => {
    const words = [w('안녕하세요', 0, 800), w(' 음,', 1500, 1700), w('오늘은', 2500, 3000)];
    const out = matchFillers(words, DEFAULT_FILLERS, 'p');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startMs: 1470, endMs: 1730, label: '음,', source: 'filler', projectId: 'p' });
  });

  it("'음악'은 매칭 안 됨", () => {
    const words = [w('음악', 0, 500), w('좋아요', 600, 1000)];
    expect(matchFillers(words, DEFAULT_FILLERS)).toEqual([]);
  });

  it('연속 필러는 하나로 병합', () => {
    const words = [w('자', 0, 300), w('어', 1000, 1200), w('음', 1210, 1400), w('시작', 2000, 2400)];
    const out = matchFillers(words, DEFAULT_FILLERS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startMs: 970, endMs: 1430, label: '어 음' });
  });

  it('이웃 단어와 간격이 150ms 미만이면 이웃까지 붙인다', () => {
    const words = [w('그래서', 0, 900), w('음', 1000, 1100), w('네', 1200, 1500)];
    const [s] = matchFillers(words, DEFAULT_FILLERS);
    expect([s.startMs, s.endMs]).toEqual([900, 1200]);
  });

  it('비활성 단어는 매칭하지 않고, 켜면 매칭', () => {
    const words = [w('그', 0, 200), w('사람', 300, 700)];
    expect(matchFillers(words, DEFAULT_FILLERS)).toEqual([]);
    const dict = DEFAULT_FILLERS.map((f) => (f.word === '그' ? { ...f, enabled: true } : f));
    expect(matchFillers(words, dict)).toHaveLength(1);
  });

  it('여러 단어 구절 매칭 ("그래서 뭐")', () => {
    const words = [w('그래서', 0, 400), w('뭐', 450, 600), w('아무튼', 2000, 2400)];
    const out = matchFillers(words, DEFAULT_FILLERS);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('그래서 뭐');
    expect(out[0].startMs).toBe(0);
  });

  it('빈 입력·빈 사전', () => {
    expect(matchFillers([], DEFAULT_FILLERS)).toEqual([]);
    expect(matchFillers([w('음', 0, 100)], [])).toEqual([]);
  });

  it('confidence는 단어 신뢰도 평균, 시작은 0 미만으로 가지 않음', () => {
    const [s] = matchFillers([{ text: '음', startMs: 10, endMs: 200, confidence: 0.4 }], DEFAULT_FILLERS);
    expect(s.startMs).toBe(0);
    expect(s.confidence).toBeCloseTo(0.4);
  });
});
