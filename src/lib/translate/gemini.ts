// Gemini 번역 어댑터 (BYOK). 자막 글자만 구글로 보내고, 영상·오디오는 절대 보내지 않는다.
// 구글은 옛 모델을 주기적으로 내린다(gemini-2.0-flash는 2026-06-01 종료 → 404). 그래서 모델 이름을 박아 두지 않고,
// 내 키로 쓸 수 있는 모델 목록을 먼저 받아 살아 있는 것을 고르고, 404·한도 초과면 다음 모델로 넘어간다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { applyGlossary } from './glossary';
import { buildReviewPrompt, buildTranslatePrompt, chunk, parseJsonArray } from './prompt';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateOptions } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** 선호 순서 — 목록에 있는 것 중 앞에서부터 쓴다. 3.6 Flash는 구글이 2.0 Flash 대신 쓰라고 안내한 모델 */
export const PREFERRED_MODELS = [
  'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
];
/** 한 번에 보낼 자막 줄 수 — 너무 크면 모델이 줄 수를 흐트러뜨린다 */
const BATCH = 25;
/** 재검수는 앞뒤 문맥이 필요해 더 크게 묶는다 (PRD-v2: 30~50개) */
const REVIEW_BATCH = 40;
/** 한도 초과·서버 과부하일 때 같은 모델로 다시 해 보는 횟수 */
const RETRIES = 2;
/** 이보다 오래 기다리라고 하면(하루 한도 소진 등) 기다리지 않고 다음 모델로 */
const MAX_WAIT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 120_000;

const KEY_HINT = '설정 화면에서 키를 다시 붙여넣어 주세요. Google AI Studio에서 키에 웹사이트 제한을 걸었다면 이 사이트 주소가 들어 있어야 합니다.';

/** 모델 이름에서 버전 숫자 (정렬용) */
function versionOf(model: string): number {
  return Number(/^gemini-(\d+(?:\.\d+)?)/.exec(model)?.[1] ?? 0);
}

/**
 * 시도할 모델 순서. available이 null이면(목록을 못 받음) 선호 순서를 그대로 하나씩 시도한다.
 * 선호 목록에 없는 새 Flash 모델도 뒤에 붙여, 구글이 선호 모델을 모두 내려도 번역이 멈추지 않게 한다.
 */
export function pickModels(available: readonly string[] | null, remembered = ''): string[] {
  let list: string[];
  if (!available) {
    list = [...PREFERRED_MODELS];
  } else {
    const have = new Set(available);
    const extra = available
      .filter((m) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(m) && !PREFERRED_MODELS.includes(m))
      .sort((a, b) => Number(a.endsWith('-lite')) - Number(b.endsWith('-lite')) || versionOf(b) - versionOf(a));
    list = [...PREFERRED_MODELS.filter((m) => have.has(m)), ...extra];
  }
  // 지난번에 잘 된 모델을 먼저 (목록에 아직 있을 때만)
  if (remembered && list.includes(remembered)) list = [remembered, ...list.filter((m) => m !== remembered)];
  return list;
}

/** 구글이 돌려준 오류 (status 0은 연결 자체가 안 된 경우) */
class GoogleError extends Error {
  constructor(readonly status: number, message = '', readonly reason = '', readonly retryAfterMs?: number) {
    super(message);
  }
}

async function readGoogleError(res: Response): Promise<GoogleError> {
  let message = '';
  let reason = '';
  let retryAfterMs: number | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: { reason?: string; retryDelay?: string }[] } };
    message = body.error?.message ?? '';
    for (const d of body.error?.details ?? []) {
      if (d.reason) reason = d.reason;
      const secs = d.retryDelay ? Number.parseFloat(d.retryDelay) : NaN;
      if (Number.isFinite(secs)) retryAfterMs = secs * 1000;
    }
  } catch {
    // 본문이 JSON이 아니면 상태 코드만으로 판단한다
  }
  return new GoogleError(res.status, message, reason, retryAfterMs);
}

function isKeyProblem(e: GoogleError): boolean {
  if (e.status === 401 || e.status === 403) return true;
  return e.status === 400 && (e.reason === 'API_KEY_INVALID' || /api key/i.test(e.message));
}

function keyError(e: GoogleError): AppError {
  const why = e.status === 403 && !/api key not valid/i.test(e.message) ? 'Gemini API 키로 번역을 쓸 수 없습니다.' : 'Gemini API 키가 올바르지 않습니다.';
  return new AppError('API_KEY_INVALID', why, e.message ? `${KEY_HINT} (구글 응답: ${e.message})` : KEY_HINT);
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
    if (isKeyProblem(err)) throw keyError(err);
    return null;
  }
  const json = (await res.json().catch(() => ({}))) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean);
}

function generationConfig(model: string, lean: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = { responseMimeType: 'application/json' };
  if (lean) return config;
  // 번역은 깊게 생각할 필요가 없다 — 생각을 줄여 빠르게. Gemini 3는 temperature를 기본값(1.0)으로 두라고 권한다
  if (model.startsWith('gemini-2.')) {
    config.temperature = 0.2;
    if (!model.endsWith('-lite')) config.thinkingConfig = { thinkingBudget: 0 };
  } else {
    config.thinkingConfig = { thinkingLevel: 'low' };
  }
  return config;
}

async function generateOnce(model: string, prompt: string, apiKey: string, lean: boolean, signal?: AbortSignal): Promise<string> {
  const res = await fetchWithTimeout(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: generationConfig(model, lean) }),
  }, signal);
  if (!res.ok) {
    const err = await readGoogleError(res);
    if (isKeyProblem(err)) throw keyError(err);
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

/** 한 모델로 요청 — 잠깐의 한도 초과·과부하·끊김은 기다렸다 다시 하고, 그래도 안 되면 ModelUnavailable */
async function generateWithModel(model: string, prompt: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  let lean = false;
  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await generateOnce(model, prompt, apiKey, lean, signal);
    } catch (e) {
      if (e instanceof AppError) throw e;
      const err = e instanceof GoogleError ? e : new GoogleError(0, e instanceof Error ? e.message : String(e));
      if (err.status === 404) throw new ModelUnavailable(model, err); // 내려간 모델
      if (err.status === 400) {
        // 이 모델이 설정값(생각 줄이기 등)을 모를 수 있다 — 기본 설정으로 한 번 더
        if (!lean) { lean = true; continue; }
        throw new ModelUnavailable(model, err);
      }
      const quotaZero = err.status === 429 && /limit: 0\b/.test(err.message);
      const wait = err.retryAfterMs ?? 1500 * 2 ** attempt;
      if (attempt >= RETRIES || quotaZero || wait > MAX_WAIT_MS) {
        if (err.status === 0) throw new AppError('NETWORK_FAILED', '번역 서버에 연결하지 못했습니다.', '인터넷 연결을 확인한 뒤 “번역 다시 시도”를 눌러 주세요.');
        throw new ModelUnavailable(model, err);
      }
      await sleep(wait, signal);
    }
  }
}

function giveUpError(last: ModelUnavailable | null): AppError {
  const c = last?.google;
  if (c?.status === 429) {
    return new AppError('TRANSLATE_FAILED', 'Gemini 무료 사용량을 다 썼습니다.', '1분쯤 뒤 “번역 다시 시도”를 누르거나, 설정에서 다른 번역 엔진을 골라 주세요.');
  }
  if (!c || c.status === 404) {
    return new AppError('TRANSLATE_FAILED', '이 API 키로 쓸 수 있는 Gemini 번역 모델을 찾지 못했습니다.', 'Google AI Studio에서 새 키를 받아 설정에 넣은 뒤 다시 시도해 주세요.');
  }
  return new AppError('TRANSLATE_FAILED', `번역 서버가 요청을 처리하지 못했습니다 (${c.status}).`, `잠시 뒤 “번역 다시 시도”를 눌러 주세요.${c.message ? ` (구글 응답: ${c.message})` : ''}`);
}

/** 이번 번역에 쓸 호출기 — 모델 하나가 안 되면 다음 모델로 넘어가고, 잘 된 모델을 기억한다 */
async function createCaller(apiKey: string, signal?: AbortSignal): Promise<(prompt: string) => Promise<string>> {
  const models = pickModels(await listGeminiModels(apiKey, signal), settings.getGeminiModel());
  let index = 0;
  let last: ModelUnavailable | null = null;
  return async (prompt) => {
    while (index < models.length) {
      try {
        const text = await generateWithModel(models[index], prompt, apiKey, signal);
        if (settings.getGeminiModel() !== models[index]) settings.setGeminiModel(models[index]);
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
    return settings.getGeminiKey().length > 0;
  },

  async translate(cues: readonly TranslateCue[], opts: TranslateOptions): Promise<TranslatedCue[]> {
    const apiKey = settings.getGeminiKey();
    if (!apiKey) throw new AppError('API_KEY_INVALID', 'Gemini API 키가 없습니다.', '설정 화면에서 키를 넣어 주세요. 키는 이 브라우저에만 저장됩니다.');

    const out: TranslatedCue[] = cues.map((c) => ({ ...c, translated: '' }));
    const batches = chunk([...cues.keys()], BATCH);
    const totalSteps = batches.length + (opts.mode === 'precise' ? Math.ceil(cues.length / REVIEW_BATCH) : 0);
    let step = 0;
    opts.onProgress?.(0, totalSteps, '번역 모델 확인 중');
    const call = await createCaller(apiKey, opts.signal);
    opts.onProgress?.(0, totalSteps, '번역 서버에 보내는 중');

    for (const indexes of batches) {
      throwIfAborted(opts.signal);
      const texts = indexes.map((i) => cues[i].text);
      const prompt = buildTranslatePrompt(texts, opts);
      // 줄 수가 안 맞는 답이 오면 한 번 더 받아 본다
      const parsed = parseJsonArray(await call(prompt), texts.length) ?? parseJsonArray(await call(prompt), texts.length) ?? [];
      indexes.forEach((cueIndex, k) => {
        // 모델이 줄을 빠뜨리면 원문을 남긴다 — 빈 자막보다 낫다
        out[cueIndex].translated = applyGlossary(parsed[k]?.trim() || cues[cueIndex].text, opts.glossary);
      });
      step += 1;
      opts.onRows?.(out.map((c) => ({ ...c })));
      opts.onProgress?.(step, totalSteps, '번역하는 중', out[indexes[indexes.length - 1]]?.translated);
    }

    if (opts.mode === 'fast') return out;

    // 2차: 앞뒤를 함께 보며 인칭·용어·존댓말을 맞춘다
    for (const indexes of chunk([...cues.keys()], REVIEW_BATCH)) {
      throwIfAborted(opts.signal);
      const pairs = indexes.map((i) => ({ text: cues[i].text, translated: out[i].translated }));
      const contextBefore = out.slice(Math.max(0, indexes[0] - 3), indexes[0]).map((c) => c.translated);
      const answer = await call(buildReviewPrompt(pairs, { ...opts, contextBefore }));
      const parsed = parseJsonArray(answer, pairs.length);
      if (parsed) {
        indexes.forEach((cueIndex, k) => {
          const revised = parsed[k]?.trim();
          if (revised) out[cueIndex].translated = applyGlossary(revised, opts.glossary);
        });
      }
      step += 1;
      opts.onRows?.(out.map((c) => ({ ...c })));
      opts.onProgress?.(step, totalSteps, '전체 문맥을 다시 보는 중', out[indexes[indexes.length - 1]]?.translated);
    }
    return out;
  },
};
