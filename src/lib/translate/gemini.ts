// Gemini 번역 어댑터 (BYOK). 자막 글자만 구글로 보내고, 영상·오디오는 절대 보내지 않는다.
// 구글은 옛 모델을 주기적으로 내린다(gemini-2.0-flash는 2026-06-01 종료 → 404). 그래서 모델 이름을 박아 두지 않고,
// 내 키로 쓸 수 있는 모델 목록을 먼저 받아 살아 있는 것을 고르고, 404·하루 한도 소진이면 다음 모델로 넘어간다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { keyCandidates, maskKey } from './geminiKey';
import { applyGlossary } from './glossary';
import { buildReviewPrompt, buildTranslatePrompt, chunk, looksUntranslated, parseJsonArray } from './prompt';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateOptions } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** 선호 순서 — 목록에 있는 것 중 앞에서부터 쓴다. 3.6 Flash는 구글이 2.0 Flash 대신 쓰라고 안내한 모델 */
export const PREFERRED_MODELS = [
  'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
];
/**
 * 한 번에 보낼 자막 줄 수. 무료 사용량은 "요청 횟수"로 세므로 크게 묶어 횟수를 줄인다
 * (985줄 → 번역 13번 + 재검수 9번). 줄 수는 응답 형식으로 강제하고, 그래도 어긋나면 반으로 나눠 다시 보낸다.
 */
const BATCH = 80;
/** 재검수는 앞뒤 문맥이 필요해 더 크게 묶는다 */
const REVIEW_BATCH = 120;
/** 이보다 작은 묶음은 더 나누지 않는다 */
const MIN_SPLIT = 10;
/** 서버 과부하·끊김일 때 같은 모델로 다시 해 보는 횟수 */
const RETRIES = 2;
/** 분당 한도에 걸렸을 때 기다렸다 다시 하는 횟수 */
const RATE_RETRIES = 6;
/** 이보다 오래 기다리라고 하면(하루 한도 소진 등) 기다리지 않고 다음 모델로 */
const MAX_WAIT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 180_000;

/** 모델 이름에서 버전 숫자 (정렬용) */
function versionOf(model: string): number {
  return Number(/^gemini-(\d+(?:\.\d+)?)/.exec(model)?.[1] ?? 0);
}

/**
 * 시도할 모델 순서. available이 null이면(목록을 못 받음) 선호 순서를 그대로 하나씩 시도한다.
 * 선호 목록에 없는 새 Flash 모델도 뒤에 붙여, 구글이 선호 모델을 모두 내려도 번역이 멈추지 않게 한다.
 */
export function pickModels(available: readonly string[] | null, remembered = ''): string[] {
  let list: string[] = [];
  if (available) {
    const have = new Set(available);
    const extra = available
      .filter((m) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(m) && !PREFERRED_MODELS.includes(m))
      .sort((a, b) => Number(a.endsWith('-lite')) - Number(b.endsWith('-lite')) || versionOf(b) - versionOf(a));
    list = [...PREFERRED_MODELS.filter((m) => have.has(m)), ...extra];
  }
  if (list.length === 0) list = [...PREFERRED_MODELS];
  // 지난번에 잘 된 모델을 먼저 (목록에 아직 있을 때만)
  if (remembered && list.includes(remembered)) list = [remembered, ...list.filter((m) => m !== remembered)];
  return list;
}

/** 구글이 돌려준 오류 (status 0은 연결 자체가 안 된 경우) */
class GoogleError extends Error {
  constructor(
    readonly status: number,
    message = '',
    readonly reason = '',
    readonly retryAfterMs?: number,
    readonly quotaIds: readonly string[] = [],
  ) {
    super(message);
  }
}

interface GoogleErrorBody {
  error?: {
    message?: string;
    details?: { reason?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[];
  };
}

async function readGoogleError(res: Response): Promise<GoogleError> {
  let message = '';
  let reason = '';
  let retryAfterMs: number | undefined;
  const quotaIds: string[] = [];
  try {
    const body = (await res.json()) as GoogleErrorBody;
    message = body.error?.message ?? '';
    for (const d of body.error?.details ?? []) {
      if (d.reason) reason = d.reason;
      const secs = d.retryDelay ? Number.parseFloat(d.retryDelay) : NaN;
      if (Number.isFinite(secs)) retryAfterMs = secs * 1000;
      for (const v of d.violations ?? []) if (v.quotaId) quotaIds.push(v.quotaId);
    }
  } catch {
    // 본문이 JSON이 아니면 상태 코드만으로 판단한다
  }
  const header = Number(res.headers.get('retry-after'));
  if (retryAfterMs === undefined && Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;
  return new GoogleError(res.status, message, reason, retryAfterMs, quotaIds);
}

function isKeyProblem(e: GoogleError): boolean {
  if (e.status === 401 || e.status === 403) return true;
  return e.status === 400 && (e.reason === 'API_KEY_INVALID' || /api key/i.test(e.message));
}

/** 하루 한도를 다 썼거나 이 모델은 무료로 못 쓰는 경우 — 기다려도 소용없다 */
function isDailyQuota(e: GoogleError): boolean {
  return e.quotaIds.some((q) => /PerDay/i.test(q)) || /limit: 0\b/.test(e.message);
}

function keyError(e: GoogleError, key: string): AppError {
  const used = key ? ` 사용한 키: ${maskKey(key)}` : '';
  if (e.status === 403 && !/api key not valid/i.test(e.message)) {
    return new AppError('API_KEY_INVALID', 'Gemini API 키로 번역을 쓸 수 없습니다.',
      `Google AI Studio에서 키에 웹사이트 제한을 걸었다면 이 사이트 주소를 넣어 주세요.${used}${e.message ? ` (구글 응답: ${e.message})` : ''}`);
  }
  return new AppError('API_KEY_INVALID', 'Gemini API 키가 올바르지 않습니다.',
    `구글이 이 키를 모른다고 합니다.${used} — AI Studio 키 목록에 있는 키인지(지운 옛 키가 아닌지), 키 전체를 복사했는지 확인해 주세요. 방금 만든 키라면 1~2분 뒤 다시 해 보세요.`);
}

/** 이 모델로는 안 되니 다음 모델로 넘어가라는 뜻 */
class ModelUnavailable extends Error {
  constructor(readonly model: string, readonly google: GoogleError) {
    super(`${model}: ${google.status} ${google.message}`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('ABORTED'));
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new AppError('ABORTED')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 사용자의 취소 + 너무 오래 걸리는 요청 끊기 */
async function fetchWithTimeout(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throwIfAborted(signal);
    throw e;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** 내 키로 글을 만들 수 있는 모델 이름들. 키가 틀리면 여기서 바로 알려 준다. 목록을 못 받으면 null */
export async function listGeminiModels(apiKey: string, signal?: AbortSignal): Promise<string[] | null> {
  let res: Response;
  try {
    // 키는 주소(?key=)가 아니라 헤더로 보낸다 — 주소에 넣으면 콘솔·기록에 그대로 남는다
    res = await fetchWithTimeout(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } }, signal);
  } catch {
    throwIfAborted(signal);
    return null;
  }
  if (!res.ok) {
    const err = await readGoogleError(res);
    if (isKeyProblem(err)) throw keyError(err, apiKey);
    return null;
  }
  const json = (await res.json().catch(() => ({}))) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean);
}

export interface GeminiSetup {
  key: string;
  /** 시도할 모델 순서 */
  models: string[];
  /** 모델 목록을 받았는지 (못 받았으면 키가 맞는지 아직 모른다) */
  verified: boolean;
}

/**
 * 저장된 키로 번역 준비. 키가 여러 개 이어 붙어 있으면 하나씩 확인해 되는 키를 쓰고, 그 키만 다시 저장한다.
 * 모든 키가 틀리면 API_KEY_INVALID. 인터넷 문제로 확인을 못 하면 첫 키로 그냥 진행한다.
 */
export async function prepareGemini(signal?: AbortSignal): Promise<GeminiSetup> {
  const raw = settings.getGeminiKey();
  const candidates = keyCandidates(raw);
  if (candidates.length === 0) {
    throw new AppError('API_KEY_INVALID', 'Gemini API 키가 없습니다.', '설정 화면에서 키를 넣어 주세요. 키는 이 브라우저에만 저장됩니다.');
  }
  let firstError: AppError | null = null;
  for (const key of candidates) {
    try {
      const available = await listGeminiModels(key, signal);
      if (available !== null && key !== raw) settings.setGeminiKey(key); // 구글이 확인해 준 키만 남겨 저장
      return { key, models: pickModels(available, settings.getGeminiModel()), verified: available !== null };
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== 'API_KEY_INVALID') throw e;
      firstError ??= e;
    }
  }
  throw firstError ?? new AppError('API_KEY_INVALID');
}

function generationConfig(model: string, lean: boolean, expectedItems: number): Record<string, unknown> {
  const config: Record<string, unknown> = { responseMimeType: 'application/json' };
  if (lean) return config;
  // 줄 수를 응답 형식으로 못 박는다 — 줄이 합쳐지거나 빠져 자막이 밀리는 일을 막는다
  config.responseSchema = { type: 'ARRAY', items: { type: 'STRING' }, minItems: expectedItems, maxItems: expectedItems };
  // 번역은 깊게 생각할 필요가 없다 — 생각을 줄여 빠르게. Gemini 3는 temperature를 기본값(1.0)으로 두라고 권한다
  if (model.startsWith('gemini-2.')) {
    config.temperature = 0.2;
    if (!model.endsWith('-lite')) config.thinkingConfig = { thinkingBudget: 0 };
  } else {
    config.thinkingConfig = { thinkingLevel: 'low' };
  }
  return config;
}

async function generateOnce(model: string, prompt: string, apiKey: string, config: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: config }),
  }, signal);
  if (!res.ok) {
    const err = await readGoogleError(res);
    if (isKeyProblem(err)) throw keyError(err, apiKey);
    throw err;
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = json.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  if (!text) {
    // 빈 답은 한 번 더 해 볼 만하다
    throw new GoogleError(500, json.promptFeedback?.blockReason ? `차단됨: ${json.promptFeedback.blockReason}` : '빈 응답');
  }
  return text;
}

interface CallContext {
  apiKey: string;
  signal?: AbortSignal;
  /** 설정값(응답 형식·생각 줄이기)을 모르는 모델 — 다음부터 기본 설정으로 보낸다 */
  leanModels: Set<string>;
  /** 분당 한도로 기다릴 때 화면에 알린다 */
  onWait?: (ms: number) => void;
}

/** 한 모델로 요청 — 분당 한도·과부하·끊김은 기다렸다 다시 하고, 그래도 안 되면 ModelUnavailable */
async function generateWithModel(model: string, prompt: string, expectedItems: number, ctx: CallContext): Promise<string> {
  let retries = 0;
  let rateRetries = 0;
  for (;;) {
    throwIfAborted(ctx.signal);
    try {
      return await generateOnce(model, prompt, ctx.apiKey, generationConfig(model, ctx.leanModels.has(model), expectedItems), ctx.signal);
    } catch (e) {
      if (e instanceof AppError) throw e;
      const err = e instanceof GoogleError ? e : new GoogleError(0, e instanceof Error ? e.message : String(e));
      if (err.status === 404) throw new ModelUnavailable(model, err); // 내려간 모델
      if (err.status === 400) {
        // 이 모델이 설정값을 모를 수 있다 — 기본 설정으로 한 번 더
        if (!ctx.leanModels.has(model)) { ctx.leanModels.add(model); continue; }
        throw new ModelUnavailable(model, err);
      }
      if (err.status === 429) {
        // 분당 한도: 구글이 알려 준 시간만큼 기다렸다 같은 모델로. 하루 한도: 다음 모델로
        const wait = (err.retryAfterMs ?? 15_000 * (rateRetries + 1)) + 500;
        if (isDailyQuota(err) || wait > MAX_WAIT_MS || rateRetries >= RATE_RETRIES) throw new ModelUnavailable(model, err);
        rateRetries += 1;
        ctx.onWait?.(wait);
        await sleep(wait, ctx.signal);
        continue;
      }
      if (retries >= RETRIES) {
        if (err.status === 0) throw new AppError('NETWORK_FAILED', '번역 서버에 연결하지 못했습니다.', '인터넷 연결을 확인한 뒤 “번역 다시 시도”를 눌러 주세요.');
        throw new ModelUnavailable(model, err);
      }
      retries += 1;
      await sleep(err.retryAfterMs ?? 1500 * 2 ** retries, ctx.signal);
    }
  }
}

function giveUpError(last: ModelUnavailable | null): AppError {
  const c = last?.google;
  if (c?.status === 429) {
    return new AppError('TRANSLATE_FAILED', '오늘 쓸 수 있는 Gemini 무료 사용량을 다 썼습니다.',
      '번역한 줄은 저장돼 있습니다. 내일 “번역 다시 시도”를 누르면 남은 줄만 이어서 번역하고, 지금 바로 하려면 번역 엔진을 DeepL로 바꿔 다시 시도해 주세요.');
  }
  if (!c || c.status === 404) {
    return new AppError('TRANSLATE_FAILED', '이 API 키로 쓸 수 있는 Gemini 번역 모델을 찾지 못했습니다.', 'Google AI Studio에서 새 키를 받아 설정에 넣은 뒤 다시 시도해 주세요.');
  }
  return new AppError('TRANSLATE_FAILED', `번역 서버가 요청을 처리하지 못했습니다 (${c.status}).`, `잠시 뒤 “번역 다시 시도”를 눌러 주세요.${c.message ? ` (구글 응답: ${c.message})` : ''}`);
}

type Caller = (prompt: string, expectedItems: number) => Promise<string>;

/** 이번 번역에 쓸 호출기 — 모델 하나가 안 되면 다음 모델로 넘어가고, 잘 된 모델을 기억한다 */
function createCaller(setup: GeminiSetup, ctx: Omit<CallContext, 'apiKey' | 'leanModels'>): Caller {
  const call: CallContext = { ...ctx, apiKey: setup.key, leanModels: new Set() };
  let index = 0;
  let last: ModelUnavailable | null = null;
  return async (prompt, expectedItems) => {
    while (index < setup.models.length) {
      const model = setup.models[index];
      try {
        const text = await generateWithModel(model, prompt, expectedItems, call);
        if (settings.getGeminiModel() !== model) settings.setGeminiModel(model);
        return text;
      } catch (e) {
        if (!(e instanceof ModelUnavailable)) throw e;
        last = e;
        index += 1;
      }
    }
    throw giveUpError(last);
  };
}

export const geminiAdapter: TranslateAdapter = {
  id: 'gemini',
  displayName: 'Gemini (내 API 키)',
  requiresApiKey: true,
  requiresSidecar: false,

  async isAvailable() {
    return keyCandidates(settings.getGeminiKey()).length > 0;
  },

  async translate(cues: readonly TranslateCue[], opts: TranslateOptions): Promise<TranslatedCue[]> {
    const out: TranslatedCue[] = cues.map((c) => ({ ...c, translated: '' }));
    const batches = chunk([...cues.keys()], BATCH);
    const totalSteps = batches.length + (opts.mode === 'precise' ? Math.ceil(cues.length / REVIEW_BATCH) : 0);
    let step = 0;
    let stepMessage = '번역하는 중';
    opts.onProgress?.(0, totalSteps, '번역 키·모델 확인 중');
    const setup = await prepareGemini(opts.signal);
    const call = createCaller(setup, {
      signal: opts.signal,
      onWait: (ms) => opts.onProgress?.(step, totalSteps, `구글 무료 사용량의 분당 한도에 걸렸습니다 — ${Math.ceil(ms / 1000)}초 기다렸다 이어서 합니다`),
    });
    opts.onProgress?.(0, totalSteps, '번역 서버에 보내는 중');

    const assign = (indexes: readonly number[], parsed: readonly string[] | null) => indexes.forEach((cueIndex, k) => {
      // 못 받았거나 원문을 베낀 줄은 비워 둔다 — 원어를 한국어 칸에 넣으면 번역된 줄로 보여 다시 번역하지 않는다
      // (빈 줄은 영상·자막 파일에서 원어 자막으로 나간다)
      const text = parsed?.[k]?.trim() ?? '';
      out[cueIndex].translated = looksUntranslated(cues[cueIndex].text, text) ? '' : applyGlossary(text, opts.glossary);
    });

    /** 줄 수가 어긋나면 반으로 나눠 다시 — 번역이 다른 줄로 밀려 들어가지 않게 한다 */
    const translateGroup = async (indexes: readonly number[]): Promise<void> => {
      throwIfAborted(opts.signal);
      const texts = indexes.map((i) => cues[i].text);
      const prompt = buildTranslatePrompt(texts, opts);
      const parsed = parseJsonArray(await call(prompt, texts.length), texts.length, { strict: true });
      if (parsed) return assign(indexes, parsed);
      if (indexes.length > MIN_SPLIT) {
        const mid = Math.ceil(indexes.length / 2);
        await translateGroup(indexes.slice(0, mid));
        await translateGroup(indexes.slice(mid));
        return undefined;
      }
      return assign(indexes, parseJsonArray(await call(prompt, texts.length), texts.length, { strict: true }));
    };

    for (const indexes of batches) {
      await translateGroup(indexes);
      step += 1;
      opts.onRows?.(out.map((c) => ({ ...c })));
      opts.onProgress?.(step, totalSteps, stepMessage, out[indexes[indexes.length - 1]]?.translated);
    }

    // 한국어로 안 온 줄만 작게 묶어 한 번 더 — 큰 묶음에서는 원문을 베끼던 모델도 몇 줄씩이면 옮긴다
    const missing = out.flatMap((c, i) => (c.translated ? [] : [i]));
    if (missing.length > 0) {
      opts.onProgress?.(step, totalSteps, `번역이 안 된 ${missing.length}줄을 다시 번역하는 중`);
      for (const indexes of chunk(missing, MIN_SPLIT)) await translateGroup(indexes);
      opts.onRows?.(out.map((c) => ({ ...c })));
    }

    if (opts.mode === 'fast') return out;

    // 2차: 앞뒤를 함께 보며 인칭·용어·존댓말을 맞춘다 (줄 수가 어긋나면 그 묶음은 1차 번역을 그대로 둔다)
    stepMessage = '전체 문맥을 다시 보는 중';
    for (const indexes of chunk([...cues.keys()], REVIEW_BATCH)) {
      throwIfAborted(opts.signal);
      const pairs = indexes.map((i) => ({ text: cues[i].text, translated: out[i].translated }));
      const contextBefore = out.slice(Math.max(0, indexes[0] - 3), indexes[0]).map((c) => c.translated);
      const answer = await call(buildReviewPrompt(pairs, { ...opts, contextBefore }), pairs.length);
      const parsed = parseJsonArray(answer, pairs.length, { strict: true });
      if (parsed) {
        indexes.forEach((cueIndex, k) => {
          const revised = parsed[k]?.trim() ?? '';
          // 감수가 원문을 베끼거나 줄이 밀려 부스러기를 내면 1차 번역을 그대로 둔다
          if (!looksUntranslated(cues[cueIndex].text, revised)) out[cueIndex].translated = applyGlossary(revised, opts.glossary);
        });
      }
      step += 1;
      opts.onRows?.(out.map((c) => ({ ...c })));
      opts.onProgress?.(step, totalSteps, stepMessage, out[indexes[indexes.length - 1]]?.translated);
    }
    return out;
  },
};
