// 번역 엔진 고르기. 엔진이 없거나 키가 없으면 화면이 그 이유를 그대로 보여 준다.
import { AppError } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { deeplAdapter } from './deepl';
import { geminiAdapter } from './gemini';
import { localLlmAdapter } from './localLlm';
import type { TranslateAdapter, TranslateCue, TranslatedCue, TranslateEngineId, TranslateOptions } from './types';

export * from './types';
export { parseGlossary, formatGlossary, applyGlossary } from './glossary';

const ADAPTERS: Record<TranslateEngineId, TranslateAdapter> = {
  gemini: geminiAdapter,
  deepl: deeplAdapter,
  'local-llm': localLlmAdapter,
};

export function getAdapter(id: TranslateEngineId): TranslateAdapter {
  return ADAPTERS[id] ?? geminiAdapter;
}

export async function availableEngines(): Promise<TranslateEngineId[]> {
  const ids = Object.keys(ADAPTERS) as TranslateEngineId[];
  const checks = await Promise.all(ids.map(async (id) => ((await ADAPTERS[id].isAvailable()) ? id : null)));
  return checks.filter((v): v is TranslateEngineId => v !== null);
}

export interface RunTranslateRequest extends Omit<TranslateOptions, 'targetLang'> {
  engine?: TranslateEngineId;
  cues: readonly TranslateCue[];
}

/** 화면에서 부르는 단일 진입점 */
export async function runTranslate(req: RunTranslateRequest): Promise<TranslatedCue[]> {
  const id = req.engine ?? settings.getTranslateEngine();
  const adapter = getAdapter(id);
  if (!(await adapter.isAvailable())) {
    throw new AppError(
      'API_KEY_INVALID',
      `${adapter.displayName}을(를) 지금 쓸 수 없습니다.`,
      adapter.requiresSidecar ? '내 컴퓨터 도우미를 켠 뒤 다시 시도해 주세요.' : '설정 화면에서 API 키를 넣어 주세요.',
    );
  }
  if (req.cues.length === 0) return [];
  return adapter.translate(req.cues, { ...req, targetLang: 'ko' });
}
