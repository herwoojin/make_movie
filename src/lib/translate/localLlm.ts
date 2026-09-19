// 내 컴퓨터에서 번역 (Ollama). 사이드카가 켜져 있을 때만 쓸 수 있고, 인터넷으로 아무것도 보내지 않는다.
import { AppError, throwIfAborted } from '@/lib/errors';
import { sidecar } from '@/lib/sidecar/client';
import { applyGlossary } from './glossary';
import { looksUntranslated } from './prompt';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateOptions } from './types';

export const localLlmAdapter: TranslateAdapter = {
  id: 'local-llm',
  displayName: '내 컴퓨터에서 번역 (Ollama)',
  requiresApiKey: false,
  requiresSidecar: true,

  async isAvailable() {
    return sidecar.features().translate;
  },

  async translate(cues: readonly TranslateCue[], opts: TranslateOptions): Promise<TranslatedCue[]> {
    if (!sidecar.features().translate) {
      throw new AppError('TRANSLATE_FAILED', '내 컴퓨터 도우미에 번역 기능이 없습니다.', '도우미를 최신 버전으로 올리거나 Gemini로 번역해 주세요.');
    }
    throwIfAborted(opts.signal);
    const result = await sidecar.translate(
      {
        cues: cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
        sourceLang: opts.sourceLang,
        targetLang: 'ko',
        tone: opts.tone,
        glossary: opts.glossary,
        mode: opts.mode,
      },
      (done, total, message) => opts.onProgress?.(done, total, message),
      opts.signal,
    );
    return result.map((r, i) => {
      const text = cues[i]?.text ?? r.text;
      const translated = r.translated?.trim() ?? '';
      return {
        start: cues[i]?.start ?? r.start,
        end: cues[i]?.end ?? r.end,
        text,
        // 한국어로 안 온 줄은 비워 둔다 — "번역 다시 시도"가 그 줄만 다시 번역한다
        translated: looksUntranslated(text, translated) ? '' : applyGlossary(translated, opts.glossary),
      };
    });
  },
};
