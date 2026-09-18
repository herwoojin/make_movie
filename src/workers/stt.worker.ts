// 음성 인식 워커. PCM은 OPFS에서 직접 읽어 메인 스레드를 거치지 않는다.
import { AppError } from '@/lib/errors';
import { readFile } from '@/lib/storage/opfs';
import { createGroqAdapter } from '@/lib/stt/groq';
import type { SttAdapter, SttResult } from '@/lib/stt/types';
import { serve } from '@/lib/worker/serve';

export type SttWorkerApi = {
  transcribe: {
    payload: { engine: 'local-whisper' | 'groq'; pcmPath?: string; pcm?: ArrayBuffer; language: string; apiKey?: string; model?: string };
    result: SttResult;
  };
};

async function adapterFor(engine: 'local-whisper' | 'groq', apiKey?: string): Promise<SttAdapter> {
  if (engine === 'groq') return createGroqAdapter(apiKey);
  // 동적 import: Groq만 쓰는 사용자는 ONNX 런타임을 내려받지 않는다
  return (await import('@/lib/stt/localWhisper')).localWhisperAdapter;
}

serve<SttWorkerApi>({
  async transcribe({ engine, pcmPath, pcm: buffer, language, apiKey, model }, { signal, progress }) {
    const adapter = await adapterFor(engine, apiKey);
    if (!(await adapter.isAvailable())) {
      throw new AppError('API_KEY_INVALID', `${adapter.displayName}을(를) 쓸 수 없습니다.`, '설정 > API 키를 확인하거나 브라우저 내장 엔진을 선택해 주세요.');
    }
    let pcm: Float32Array;
    if (buffer) pcm = new Float32Array(buffer);
    else if (pcmPath) pcm = new Float32Array(await (await readFile(pcmPath)).arrayBuffer());
    else throw new AppError('NOT_FOUND', '인식할 오디오가 없습니다.', '영상을 다시 불러와 주세요.');

    const lang = engine === 'local-whisper' ? (language === 'ko' ? 'korean' : language) : language;
    const result = await adapter.transcribe(pcm, {
      language: lang,
      model,
      signal,
      onDownload: (loaded, total) => progress({ phase: 'download', done: loaded, total, message: '음성 인식 파일 내려받는 중' }),
      onProgress: (ratio) => progress({ phase: 'transcribe', done: Math.round(ratio * 1000), total: 1000 }),
    });
    return { result };
  },
});
