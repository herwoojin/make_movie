import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settings } from '@/lib/settings';
import { geminiAdapter, pickModels, PREFERRED_MODELS } from './gemini';
import type { TranslatedCue, TranslateOptions } from './types';

const CUES = [
  { start: 0, end: 1000, text: 'こんにちは' },
  { start: 1000, end: 2000, text: 'ありがとう' },
];

const OPTS: TranslateOptions = { sourceLang: 'ja', targetLang: 'ko', tone: 'literal', glossary: {}, mode: 'fast' };

interface Call { url: string; method: string; headers: Record<string, string> }

/** 가짜 구글 서버: 모델 목록 + 모델별 응답을 정해 둔다 */
function fakeGoogle(opts: { models?: string[] | 'fail' | Response; reply?: (model: string) => Response | undefined }) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? 'GET', headers });
    if (url.includes('/models?')) {
      if (opts.models === 'fail') throw new TypeError('Failed to fetch');
      if (opts.models instanceof Response) return opts.models;
      return Response.json({ models: (opts.models ?? []).map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) });
    }
    const model = /models\/([^:]+):generateContent/.exec(url)?.[1] ?? '';
    const custom = opts.reply?.(model);
    if (custom) return custom;
    const prompt = (JSON.parse(String(init.body)) as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text;
    const line = prompt.split('\n').find((l) => l.trim().startsWith('[')) ?? '[]';
    const items = JSON.parse(line) as (string | { 원문: string })[];
    const out = items.map((it) => `${model}:${typeof it === 'string' ? it : it.원문}`);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const googleError = (status: number, message: string, details: object[] = []) =>
  Response.json({ error: { code: status, message, details } }, { status });

beforeEach(() => {
  localStorage.clear();
  settings.setGeminiKey('test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pickModels', () => {
  it('목록에 있는 모델 중 선호 순서대로 고르고, 목록에 없는(내려간) 모델은 쓰지 않는다', () => {
    expect(pickModels(['gemini-2.5-flash', 'gemini-3.6-flash'])).toEqual(['gemini-3.6-flash', 'gemini-2.5-flash']);
    expect(PREFERRED_MODELS).not.toContain('gemini-2.0-flash');
  });

  it('목록을 못 받으면 선호 순서를 그대로 시도한다', () => {
    expect(pickModels(null)).toEqual(PREFERRED_MODELS);
  });

  it('선호 목록에 없는 새 Flash 모델도 뒤에 붙이고, 미리보기·이미지 모델은 뺀다', () => {
    const picked = pickModels(['gemini-4-flash-lite', 'gemini-4-flash', 'gemini-3.6-flash', 'gemini-4-flash-preview', 'gemini-4-flash-image', 'gemma-3-27b-it']);
    expect(picked).toEqual(['gemini-3.6-flash', 'gemini-4-flash', 'gemini-4-flash-lite']);
  });

  it('지난번에 잘 된 모델을 먼저 쓰되, 목록에서 사라졌으면 무시한다', () => {
    expect(pickModels(['gemini-3.6-flash', 'gemini-2.5-flash'], 'gemini-2.5-flash')[0]).toBe('gemini-2.5-flash');
    expect(pickModels(['gemini-3.6-flash'], 'gemini-2.0-flash')).toEqual(['gemini-3.6-flash']);
  });
});

describe('geminiAdapter', () => {
  it('키는 주소가 아니라 헤더로 보낸다', async () => {
    const calls = fakeGoogle({ models: ['gemini-3.6-flash'] });
    await geminiAdapter.translate(CUES, OPTS);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      expect(c.url).not.toContain('key=');
      expect(c.url).not.toContain('test-key');
      expect(c.headers['x-goog-api-key']).toBe('test-key');
    }
  });

  it('모델이 내려가 404가 나면 다음 모델로 넘어가 끝까지 번역하고, 잘 된 모델을 기억한다', async () => {
    const calls = fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-2.5-flash'],
      reply: (m) => (m === 'gemini-3.6-flash' ? googleError(404, 'models/gemini-3.6-flash is not found for API version v1beta') : undefined),
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows.map((r) => r.translated)).toEqual(['gemini-2.5-flash:こんにちは', 'gemini-2.5-flash:ありがとう']);
    expect(settings.getGeminiModel()).toBe('gemini-2.5-flash');
    expect(calls.filter((c) => c.method === 'POST').map((c) => /models\/([^:]+):/.exec(c.url)?.[1])).toEqual(['gemini-3.6-flash', 'gemini-2.5-flash']);
  });

  it('모델 목록을 못 받아도 선호 순서대로 시도한다', async () => {
    const calls = fakeGoogle({ models: 'fail' });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe(`${PREFERRED_MODELS[0]}:こんにちは`);
    expect(calls.some((c) => c.url.includes(`${PREFERRED_MODELS[0]}:generateContent`))).toBe(true);
  });

  it('키가 틀리면 번역을 보내기 전에 바로 알려 준다', async () => {
    const calls = fakeGoogle({
      models: googleError(400, 'API key not valid. Please pass a valid API key.', [{ reason: 'API_KEY_INVALID' }]),
    });
    await expect(geminiAdapter.translate(CUES, OPTS)).rejects.toMatchObject({ code: 'API_KEY_INVALID' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('무료 한도가 0인 모델은 기다리지 않고 다음 모델로', async () => {
    fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-3.1-flash-lite'],
      reply: (m) => (m === 'gemini-3.6-flash' ? googleError(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0') : undefined),
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-3.1-flash-lite:こんにちは');
  });

  it('잠깐의 과부하(503)는 같은 모델로 다시 해 본다', async () => {
    let failures = 1;
    const calls = fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-2.5-flash'],
      reply: () => (failures-- > 0 ? googleError(503, 'The model is overloaded.', [{ retryDelay: '0s' }]) : undefined),
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-3.6-flash:こんにちは');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('설정값을 모르는 모델(400)은 기본 설정으로 한 번 더 보낸다', async () => {
    const bodies: string[] = [];
    fakeGoogle({
      models: ['gemini-3.6-flash'],
      reply: () => {
        const n = bodies.push('x');
        return n === 1 ? googleError(400, 'Unknown name "thinkingLevel"') : undefined;
      },
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-3.6-flash:こんにちは');
  });

  it('쓸 수 있는 모델이 하나도 없으면 알아듣기 쉬운 말로 알려 준다', async () => {
    fakeGoogle({ models: ['gemini-3.6-flash'], reply: () => googleError(404, 'not found') });
    await expect(geminiAdapter.translate(CUES, OPTS)).rejects.toMatchObject({
      code: 'TRANSLATE_FAILED',
      message: expect.stringContaining('번역 모델을 찾지 못했습니다'),
    });
  });

  it('정밀 모드는 묶음마다 지금까지의 결과를 알려 준다', async () => {
    fakeGoogle({ models: ['gemini-3.6-flash'] });
    const seen: TranslatedCue[][] = [];
    await geminiAdapter.translate(CUES, { ...OPTS, mode: 'precise', onRows: (rows) => seen.push(rows) });
    expect(seen).toHaveLength(2); // 1차 번역 + 재검수
    expect(seen[0].every((r) => r.translated.length > 0)).toBe(true);
  });
});
