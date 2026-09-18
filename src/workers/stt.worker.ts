// 음성 인식 워커. PCM은 OPFS에서 직접 읽어 메인 스레드를 거치지 않는다.
import { AppError } from '@/lib/errors';
import { readFile } from '@/lib/storage/opfs';
import { createGroqAdapter } from '@/lib/stt/groq';
import type { SttAdapter, SttResult } from '@/lib/stt/types';
import { serve } from '@/lib/worker/serve';

export type SttWorkerApi = {
  transcribe: {
    payload: {
      engine: 'local-whisper' | 'groq'; pcmPath?: string; pcm?: ArrayBuffer; language: string; apiKey?: string; model?: string;
      /** 서버가 크기를 안 알려 줄 때 다운로드 진행률의 분모로 쓸 모델 크기 */
      expectedDownloadBytes?: number;
    };
    result: SttResult;
  };
};

async function adapterFor(engine: 'local-whisper' | 'groq', apiKey?: string): Promise<SttAdapter> {
  if (engine === 'groq') return createGroqAdapter(apiKey);
  // 동적 import: Groq만 쓰는 사용자는 ONNX 런타임을 내려받지 않는다
  return (await import('@/lib/stt/localWhisper')).localWhisperAdapter;
}

serve<SttWorkerApi>({
  async transcribe({ engine, pcmPath, pcm: buffer, language, apiKey, model, expectedDownloadBytes }, { signal, progress }) {
    const adapter = await adapterFor(engine, apiKey);
    if (!(await adapter.isAvailable())) {
      throw new AppError('API_KEY_INVALID', `${adapter.displayName}을(를) 쓸 수 없습니다.`, '설정 > API 키를 확인하거나 브라우저 내장 엔진을 선택해 주세요.');
    }
    let pcm: Float32Array;
    if (buffer) pcm = new Float32Array(buffer);
    else if (pcmPath) pcm = new Float32Array(await (await readFile(pcmPath)).arrayBuffer());
    else throw new AppError('NOT_FOUND', '인식할 오디오가 없습니다.', '영상을 다시 불러와 주세요.');

    const lang = engine === 'local-whisper' ? (language === 'ko' ? 'korean' : language) : language;
    // 토큰마다 메시지를 보내면 화면 갱신이 너무 잦으므로 0.12초에 한 번만 (구간이 바뀔 때는 바로)
    let lastSent = 0;
    let lastChunk = -1;
    const result = await adapter.transcribe(pcm, {
      language: lang,
      model,
      expectedDownloadBytes,
      signal,
      onDownload: (loaded, total) => progress({ phase: 'download', done: loaded, total, message: '음성 인식 모델 내려받는 중 (처음 한 번만)' }),
      onProgress: (ratio) => progress({ phase: 'transcribe', done: Math.round(ratio * 1000), total: 1000 }),
      onPartial: (p) => {
        const now = Date.now();
        if (!p.final && p.chunk === lastChunk && now - lastSent < 120) return;
        lastSent = now;
        lastChunk = p.chunk;
        progress({
          phase: 'transcribe',
          done: Math.round(p.ratio * 1000),
          total: 1000,
          message: '음성을 글자로 바꾸는 중',
          detail: { chunk: p.chunk + 1, chunks: p.chunks, fromMs: p.fromMs, toMs: p.toMs, text: p.text },
        });
      },
    });
    return { result };
  },
});
