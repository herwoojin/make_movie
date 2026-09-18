// Groq Whisper (BYOK). 키는 사용자의 브라우저에만 있고, 이 모듈은 호출 시점에 키를 인자로 받는다.
import { encodeWav, samplesPerWavChunk } from '@/lib/audio/wav';
import { AppError, throwIfAborted } from '@/lib/errors';
import type { SttAdapter, SttResult, SttWord } from './types';

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const GROQ_MODEL = 'whisper-large-v3-turbo';
/** Groq 무료 티어 업로드 한도 25MB. 헤더·폼 오버헤드를 고려해 여유를 둔다 */
export const GROQ_MAX_BYTES = 24 * 1024 * 1024;
const SAMPLE_RATE = 16_000;

interface GroqVerbose {
  text: string;
  language?: string;
  segments?: { start: number; end: number; text: string }[];
  words?: { word: string; start: number; end: number }[];
}

export function createGroqAdapter(apiKey: string | undefined): SttAdapter {
  return {
    id: 'groq',
    displayName: 'Groq Whisper',
    requiresApiKey: true,
    sendsAudioToServer: true,
    providerName: 'Groq',
    async isAvailable() {
      return typeof apiKey === 'string' && apiKey.trim().length > 0;
    },
    async transcribe(pcm, { language = 'ko', onProgress, signal }): Promise<SttResult> {
      if (!apiKey?.trim()) throw new AppError('API_KEY_INVALID', 'Groq API 키가 없습니다.', '설정 > API 키에서 Groq 키를 넣어 주세요.');
      const perChunk = samplesPerWavChunk(GROQ_MAX_BYTES);
      const chunks = Math.max(1, Math.ceil(pcm.length / perChunk));
      const words: SttWord[] = [];
      const segments: SttResult['segments'] = [];
      let detected = language;

      for (let c = 0; c < chunks; c++) {
        throwIfAborted(signal);
        const offsetMs = Math.round((c * perChunk * 1000) / SAMPLE_RATE);
        const slice = pcm.subarray(c * perChunk, Math.min(pcm.length, (c + 1) * perChunk));
        const form = new FormData();
        form.append('file', new Blob([encodeWav([slice], SAMPLE_RATE)], { type: 'audio/wav' }), `chunk-${c}.wav`);
        form.append('model', GROQ_MODEL);
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', 'word');
        form.append('timestamp_granularities[]', 'segment');
        if (language && language !== 'auto') form.append('language', language);

        let res: Response;
        try {
          res = await fetch(GROQ_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey.trim()}` }, body: form, signal });
        } catch (e) {
          if ((e as { name?: string }).name === 'AbortError') throw new AppError('ABORTED');
          throw new AppError('STT_API_ERROR', 'Groq 서버에 연결하지 못했습니다.', '인터넷 연결을 확인하고 다시 시도해 주세요.');
        }
        if (res.status === 401 || res.status === 403) throw new AppError('API_KEY_INVALID', 'Groq API 키가 거부되었습니다.', '설정에서 키를 다시 확인해 주세요.');
        if (res.status === 429) throw new AppError('STT_API_ERROR', 'Groq 무료 사용량 한도에 걸렸습니다.', '잠시 후 다시 시도하거나 브라우저 내장 엔진을 써 주세요.');
        if (!res.ok) throw new AppError('STT_API_ERROR', `Groq 응답 오류 (${res.status})`, '잠시 후 다시 시도해 주세요.');

        const data = (await res.json()) as GroqVerbose;
        detected = data.language ?? detected;
        for (const w of data.words ?? []) {
          const text = w.word.trim();
          if (!text) continue;
          const start = Math.round(w.start * 1000) + offsetMs;
          words.push({ text, start, end: Math.max(start + 1, Math.round(w.end * 1000) + offsetMs) });
        }
        for (const s of data.segments ?? []) {
          segments.push({ start: Math.round(s.start * 1000) + offsetMs, end: Math.round(s.end * 1000) + offsetMs, text: s.text.trim() });
        }
        onProgress?.((c + 1) / chunks);
      }
      return { words, segments, language: detected };
    },
  };
}
