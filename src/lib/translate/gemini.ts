// Gemini 번역 어댑터 (BYOK). 자막 글자만 구글로 보내고, 영상·오디오는 절대 보내지 않는다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { applyGlossary } from './glossary';
import { buildReviewPrompt, buildTranslatePrompt, chunk, parseJsonArray } from './prompt';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateOptions } from './types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.0-flash';
/** 한 번에 보낼 자막 줄 수 — 너무 크면 모델이 줄 수를 흐트러뜨린다 */
const BATCH = 25;
/** 재검수는 앞뒤 문맥이 필요해 더 크게 묶는다 (PRD-v2: 30~50개) */
const REVIEW_BATCH = 40;

async function callGemini(prompt: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal,
  });
  if (res.status === 400 || res.status === 403) {
    throw new AppError('API_KEY_INVALID', 'Gemini API 키가 올바르지 않습니다.', '설정 화면에서 키를 다시 확인해 주세요.');
  }
  if (res.status === 429) {
    throw new AppError('NETWORK_FAILED', 'Gemini 사용량 한도에 걸렸습니다.', '잠시 뒤 다시 시도하거나 다른 번역 엔진을 골라 주세요.');
  }
  if (!res.ok) {
    throw new AppError('NETWORK_FAILED', `번역 서버가 응답하지 않습니다 (${res.status}).`, '인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new AppError('NETWORK_FAILED', '번역 결과가 비어 있습니다.', '다시 시도하거나 번역 방식을 “빠르게”로 바꿔 보세요.');
  return text;
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

    for (const indexes of batches) {
      throwIfAborted(opts.signal);
      const texts = indexes.map((i) => cues[i].text);
      const answer = await callGemini(buildTranslatePrompt(texts, opts), apiKey, opts.signal);
      const parsed = parseJsonArray(answer, texts.length) ?? [];
      indexes.forEach((cueIndex, k) => {
        // 모델이 줄을 빠뜨리면 원문을 남긴다 — 빈 자막보다 낫다
        out[cueIndex].translated = applyGlossary(parsed[k]?.trim() || cues[cueIndex].text, opts.glossary);
      });
      step += 1;
      opts.onProgress?.(step, totalSteps, '번역하는 중');
    }

    if (opts.mode === 'fast') return out;

    // 2차: 앞뒤를 함께 보며 인칭·용어·존댓말을 맞춘다
    for (const indexes of chunk([...cues.keys()], REVIEW_BATCH)) {
      throwIfAborted(opts.signal);
      const pairs = indexes.map((i) => ({ text: cues[i].text, translated: out[i].translated }));
      const contextBefore = out.slice(Math.max(0, indexes[0] - 3), indexes[0]).map((c) => c.translated);
      const answer = await callGemini(buildReviewPrompt(pairs, { ...opts, contextBefore }), apiKey, opts.signal);
      const parsed = parseJsonArray(answer, pairs.length);
      if (parsed) {
        indexes.forEach((cueIndex, k) => {
          const revised = parsed[k]?.trim();
          if (revised) out[cueIndex].translated = applyGlossary(revised, opts.glossary);
        });
      }
      step += 1;
      opts.onProgress?.(step, totalSteps, '전체 문맥을 다시 보는 중');
    }
    return out;
  },
};
