import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settings } from '@/lib/settings';
import { geminiAdapter, pickModels, PREFERRED_MODELS } from './gemini';
import type { TranslatedCue, TranslateOptions } from './types';

const CUES = [
  { start: 0, end: 1000, text: 'こんにちは' },
  { start: 1000, end: 2000, text: 'ありがとう' },
];

/** 가짜 번역 사전 — 가짜 서버는 "모델:한국어"로 답한다 (사전에 없는 글은 그대로) */
const KO: Record<string, string> = { こんにちは: '안녕하세요', ありがとう: '고마워요' };

const OPTS: TranslateOptions ={ sourceLang: 'ja', targetLang: 'ko', tone: 'literal', glossary: {}, mode: 'fast' };

interface Call { url: string; method: string; headers: Record<string, string> }

/** 가짜 구글 서버: 모델 목록 + 모델별 응답을 정해 둔다 */
interface GenerateBody {
  contents: { parts: { text: string }[] }[];
  generationConfig: { responseSchema?: { minItems?: number; maxItems?: number } };
}

function fakeGoogle(opts: {
  models?: string[] | 'fail' | Response | ((key: string) => Response);
  reply?: (model: string, items: (string | { 원문: string })[], body: GenerateBody) => Response | undefined;
}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? 'GET', headers });
    if (url.includes('/models?')) {
      if (opts.models === 'fail') throw new TypeError('Failed to fetch');
      if (opts.models instanceof Response) return opts.models;
      if (typeof opts.models === 'function') return opts.models(headers['x-goog-api-key']);
      return Response.json({ models: (opts.models ?? []).map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) });
    }
    const model = /models\/([^:]+):generateContent/.exec(url)?.[1] ?? '';
    const body = JSON.parse(String(init.body)) as GenerateBody;
    const prompt = body.contents[0].parts[0].text;
    const line = prompt.split('\n').find((l) => l.trim().startsWith('[')) ?? '[]';
    const items = JSON.parse(line) as (string | { 원문: string })[];
    const custom = opts.reply?.(model, items, body);
    if (custom) return custom;
    const out = items.map((it) => {
      const text = typeof it === 'string' ? it : it.원문;
      return `${model}:${KO[text] ?? text}`;
    });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const googleError = (status: number, message: string, details: object[] = []) =>
  Response.json({ error: { code: status, message, details } }, { status });

const modelList = (models: string[]) =>
  Response.json({ models: models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) });

const KEY_OLD = `AIza${'a'.repeat(35)}`;
const KEY_NEW = `AIza${'b'.repeat(35)}`;

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
    expect(rows.map((r) => r.translated)).toEqual(['gemini-2.5-flash:안녕하세요', 'gemini-2.5-flash:고마워요']);
    expect(settings.getGeminiModel()).toBe('gemini-2.5-flash');
    expect(calls.filter((c) => c.method === 'POST').map((c) => /models\/([^:]+):/.exec(c.url)?.[1])).toEqual(['gemini-3.6-flash', 'gemini-2.5-flash']);
  });

  it('모델 목록을 못 받아도 선호 순서대로 시도한다', async () => {
    const calls = fakeGoogle({ models: 'fail' });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe(`${PREFERRED_MODELS[0]}:안녕하세요`);
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
    expect(rows[0].translated).toBe('gemini-3.1-flash-lite:안녕하세요');
  });

  it('잠깐의 과부하(503)는 같은 모델로 다시 해 본다', async () => {
    let failures = 1;
    const calls = fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-2.5-flash'],
      reply: () => (failures-- > 0 ? googleError(503, 'The model is overloaded.', [{ retryDelay: '0s' }]) : undefined),
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-3.6-flash:안녕하세요');
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
    expect(rows[0].translated).toBe('gemini-3.6-flash:안녕하세요');
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

  it('분당 한도(429)는 구글이 알려 준 만큼 기다렸다 같은 모델로 이어서 하고, 기다리는 동안 화면에 알린다', async () => {
    let limited = 1;
    const calls = fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-2.5-flash'],
      reply: () => (limited-- > 0
        ? googleError(429, 'Resource exhausted', [
          { violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
          { retryDelay: '0.01s' },
        ])
        : undefined),
    });
    const messages: string[] = [];
    const rows = await geminiAdapter.translate(CUES, { ...OPTS, onProgress: (_d, _t, m) => messages.push(m ?? '') });
    expect(rows[0].translated).toBe('gemini-3.6-flash:안녕하세요');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(messages.some((m) => m.includes('분당 한도'))).toBe(true);
  });

  it('하루 한도를 다 쓴 모델은 기다리지 않고 다음 모델로', async () => {
    fakeGoogle({
      models: ['gemini-3.6-flash', 'gemini-2.5-flash'],
      reply: (m) => (m === 'gemini-3.6-flash'
        ? googleError(429, 'Resource exhausted', [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '30s' }])
        : undefined),
    });
    const started = Date.now();
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-2.5-flash:안녕하세요');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('옛 키 뒤에 새 키를 이어 붙여 저장했어도, 되는 키를 찾아 쓰고 그 키만 남긴다', async () => {
    settings.setGeminiKey(`${KEY_OLD}${KEY_NEW}`);
    fakeGoogle({
      // 새 키는 아직 안 켜졌고(틀림), 옛 키는 된다고 치자 — 순서와 상관없이 되는 키를 찾아야 한다
      models: (key) => (key === KEY_OLD ? modelList(['gemini-3.6-flash']) : googleError(400, 'API key not valid. Please pass a valid API key.', [{ reason: 'API_KEY_INVALID' }])),
    });
    const rows = await geminiAdapter.translate(CUES, OPTS);
    expect(rows[0].translated).toBe('gemini-3.6-flash:안녕하세요');
    expect(settings.getGeminiKey()).toBe(KEY_OLD);
  });

  it('모든 키가 틀리면 어떤 키를 썼는지(앞뒤 4자) 알려 준다', async () => {
    settings.setGeminiKey(KEY_NEW);
    fakeGoogle({ models: googleError(400, 'API key not valid. Please pass a valid API key.', [{ reason: 'API_KEY_INVALID' }]) });
    await expect(geminiAdapter.translate(CUES, OPTS)).rejects.toMatchObject({
      code: 'API_KEY_INVALID',
      hint: expect.stringContaining('AIza…bbbb'),
    });
  });

  it('줄 수를 응답 형식으로 못 박고, 그래도 어긋나면 반으로 나눠 다시 보내 줄이 밀리지 않게 한다', async () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ start: i * 1000, end: i * 1000 + 900, text: `line${i}` }));
    const schemas: (number | undefined)[] = [];
    fakeGoogle({
      models: ['gemini-3.6-flash'],
      reply: (_m, items, body) => {
        schemas.push(body.generationConfig.responseSchema?.maxItems);
        // 큰 묶음에서는 두 줄을 합쳐 한 줄 적게 돌려준다 (실제로 자주 생기는 실수)
        if (items.length > 12) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(items.slice(1).map((t) => `ko:${String(t)}`)) }] } }] });
        return undefined;
      },
    });
    const rows = await geminiAdapter.translate(many, OPTS);
    expect(schemas[0]).toBe(24);
    rows.forEach((r, i) => expect(r.translated).toBe(`gemini-3.6-flash:line${i}`));
  });

  it('원문을 그대로 돌려준 줄은 한국어 칸에 넣지 않고 다시 번역하고, 끝내 안 되면 비워 둔다', async () => {
    const noise = 'っとで、おっとで、おっとで、OKな'; // 음성 인식이 잘못 알아들은 반복
    const echoed = new Set(['こんにちは']); // 처음 한 번만 원문을 베낀다
    const sent: number[] = [];
    fakeGoogle({
      models: ['gemini-3.6-flash'],
      reply: (m, items) => {
        sent.push(items.length);
        const out = items.map((it) => {
          const text = String(it);
          if (text === noise || echoed.delete(text)) return text;
          return `${m}:${KO[text] ?? text}`;
        });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
      },
    });
    const rows = await geminiAdapter.translate([...CUES, { start: 2000, end: 3000, text: noise }], OPTS);
    expect(rows.map((r) => r.translated)).toEqual(['gemini-3.6-flash:안녕하세요', 'gemini-3.6-flash:고마워요', '']);
    expect(sent).toEqual([3, 2]); // 베낀 두 줄만 다시 보냈다
  });

  it('재검수가 원문을 돌려주거나 줄이 밀려 부스러기를 내면 1차 번역을 그대로 둔다', async () => {
    fakeGoogle({
      models: ['gemini-3.6-flash'],
      reply: (_m, items) => {
        if (typeof items[0] === 'string') return undefined; // 1차 번역은 정상
        const review = items as { 원문: string }[];
        const out = [...review.slice(1).map((it) => it.원문), '(']; // 한 줄씩 밀린 원문 + 괄호
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
      },
    });
    const rows = await geminiAdapter.translate(CUES, { ...OPTS, mode: 'precise' });
    expect(rows.map((r) => r.translated)).toEqual(['gemini-3.6-flash:안녕하세요', 'gemini-3.6-flash:고마워요']);
  });
});
