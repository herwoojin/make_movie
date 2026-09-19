// DeepL 번역 어댑터 (BYOK). 브라우저에서 직접 부르는 것을 막는 경우가 있어,
// 실패하면 "내 컴퓨터 도우미가 필요하다"고 분명히 알려 준다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { applyGlossary } from './glossary';
import { chunk, looksUntranslated } from './prompt';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateOptions } from './types';

/** 무료 키는 :fx로 끝난다 */
function endpoint(key: string): string {
  return key.trim().endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
}

const BATCH = 40;

const FORMALITY: Record<TranslateOptions['tone'], string | undefined> = {
  literal: undefined,
  friendly: 'prefer_less',
  formal: 'prefer_more',
  casual: 'prefer_less',
};

export const deeplAdapter: TranslateAdapter = {
  id: 'deepl',
  displayName: 'DeepL (내 API 키)',
  requiresApiKey: true,
  requiresSidecar: false,

  async isAvailable() {
    return settings.getDeeplKey().length > 0;
  },

  async translate(cues: readonly TranslateCue[], opts: TranslateOptions): Promise<TranslatedCue[]> {
    const key = settings.getDeeplKey();
    if (!key) throw new AppError('API_KEY_INVALID', 'DeepL API 키가 없습니다.', '설정 화면에서 키를 넣어 주세요. 키는 이 브라우저에만 저장됩니다.');

    const out: TranslatedCue[] = cues.map((c) => ({ ...c, translated: '' }));
    const batches = chunk([...cues.keys()], BATCH);
    let done = 0;

    for (const indexes of batches) {
      throwIfAborted(opts.signal);
      const body = new URLSearchParams();
      indexes.forEach((i) => body.append('text', cues[i].text));
      body.set('target_lang', 'KO');
      if (opts.sourceLang !== 'auto') body.set('source_lang', opts.sourceLang.toUpperCase());
      const formality = FORMALITY[opts.tone];
      if (formality) body.set('formality', formality);

      let res: Response;
      try {
        res = await fetch(endpoint(key), {
          method: 'POST',
          headers: { Authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: opts.signal,
        });
      } catch (e) {
        if (opts.signal?.aborted) throw new AppError('ABORTED');
        throw new AppError(
          'NETWORK_FAILED',
          'DeepL에 브라우저에서 바로 연결하지 못했습니다.',
          'DeepL은 웹 브라우저의 직접 호출을 막는 경우가 있습니다. Gemini로 바꾸거나 내 컴퓨터 도우미를 켜 주세요.',
        );
      }
      if (res.status === 403) throw new AppError('API_KEY_INVALID', 'DeepL API 키가 올바르지 않습니다.', '설정 화면에서 키를 다시 확인해 주세요.');
      if (res.status === 456) throw new AppError('NETWORK_FAILED', 'DeepL 이번 달 번역 한도를 다 썼습니다.', '다음 달까지 기다리거나 Gemini로 번역해 주세요.');
      if (!res.ok) throw new AppError('NETWORK_FAILED', `DeepL이 응답하지 않습니다 (${res.status}).`, '잠시 뒤 다시 시도해 주세요.');

      const json = (await res.json()) as { translations?: { text?: string }[] };
      indexes.forEach((cueIndex, k) => {
        const text = json.translations?.[k]?.text?.trim() ?? '';
        // 한국어로 안 온 줄은 비워 둔다 — "번역 다시 시도"가 그 줄만 다시 번역한다
        out[cueIndex].translated = looksUntranslated(cues[cueIndex].text, text) ? '' : applyGlossary(text, opts.glossary);
      });
      done += indexes.length;
      opts.onProgress?.(done, cues.length, '번역하는 중', out[indexes[indexes.length - 1]]?.translated);
    }
    return out;
  },
};
