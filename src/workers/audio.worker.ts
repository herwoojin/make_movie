// 오디오 분석 워커: 파형 피크, 무음 감지, PCM 캐시.
// 20분 PCM(약 77MB)을 메인 스레드에 들고 있지 않도록, 피크 계산 후 OPFS로 내보내고 워커에만 1개 캐시한다.
import type { CutSuggestion, TimeRange } from '@/types/models';
import { computePeaks, PEAKS_PER_SECOND } from '@/lib/audio/peaks';
import { detectSilence, type SilenceParams } from '@/lib/audio/silence';
import { encodeWav } from '@/lib/audio/wav';
import { AudioSplicer, concatPlanes, CROSSFADE_MS, msRangesToSamples } from '@/lib/encode/audioSplice';
import { AppError } from '@/lib/errors';
import { readFile } from '@/lib/storage/opfs';
import { writeBytesSync } from '@/lib/storage/opfsSync';
import { serve } from '@/lib/worker/serve';

export type AudioWorkerApi = {
  analyze: {
    payload: { key: string; pcm: ArrayBuffer; sampleRate: number; pcmPath?: string };
    result: { peaks: ArrayBuffer; pointsPerSecond: number; durationMs: number; stored: boolean };
  };
  silence: {
    payload: { key: string; pcmPath?: string; sampleRate: number; params: SilenceParams; projectId: string };
    result: { suggestions: CutSuggestion[]; elapsedMs: number };
  };
  getPcm: { payload: { key: string; pcmPath?: string }; result: { pcm: ArrayBuffer } };
  /** 오디오만 내보내기 / 도구함 오디오 추출: 유지 구간 이어붙이기(크로스페이드) → WAV */
  spliceWav: { payload: { planes: ArrayBuffer[]; sampleRate: number; ranges: TimeRange[] }; result: { wav: ArrayBuffer } };
};

let cache: { key: string; pcm: Float32Array } | null = null;

async function loadPcm(key: string, pcmPath?: string): Promise<Float32Array> {
  if (cache?.key === key) return cache.pcm;
  if (!pcmPath) throw new AppError('NOT_FOUND', '분석할 오디오가 없습니다.', '영상을 다시 불러와 주세요.');
  const file = await readFile(pcmPath);
  const pcm = new Float32Array(await file.arrayBuffer());
  cache = { key, pcm };
  return pcm;
}

serve<AudioWorkerApi>({
  async analyze({ key, pcm: buffer, sampleRate, pcmPath }, { progress }) {
    const pcm = new Float32Array(buffer);
    progress({ phase: 'analyze', done: 0, total: 2 });
    const peaks = computePeaks(pcm, sampleRate, PEAKS_PER_SECOND);
    progress({ phase: 'analyze', done: 1, total: 2 });
    let stored = false;
    if (pcmPath) {
      try {
        await writeBytesSync(pcmPath, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        stored = true;
      } catch {
        // OPFS를 못 쓰는 환경: 워커 캐시만으로 계속 동작 (새로고침하면 다시 디코드)
      }
    }
    cache = { key, pcm };
    progress({ phase: 'write', done: 2, total: 2 });
    return {
      result: { peaks: peaks.buffer, pointsPerSecond: PEAKS_PER_SECOND, durationMs: Math.round((pcm.length / sampleRate) * 1000), stored },
      transfer: [peaks.buffer],
    };
  },

  async silence({ key, pcmPath, sampleRate, params, projectId }) {
    const pcm = await loadPcm(key, pcmPath);
    const t0 = performance.now();
    const suggestions = detectSilence(pcm, sampleRate, params, projectId);
    return { result: { suggestions, elapsedMs: Math.round(performance.now() - t0) } };
  },

  async getPcm({ key, pcmPath }) {
    const pcm = await loadPcm(key, pcmPath);
    const copy = pcm.slice();
    return { result: { pcm: copy.buffer }, transfer: [copy.buffer] };
  },

  async spliceWav({ planes, sampleRate, ranges }, { progress }) {
    const channels = planes.map((b) => new Float32Array(b));
    const splicer = new AudioSplicer(msRangesToSamples(ranges, sampleRate), channels.length, Math.round((sampleRate * CROSSFADE_MS) / 1000));
    progress({ phase: 'render', done: 0, total: 1 });
    const chunks = [...splicer.push(channels, 0), ...splicer.flush()];
    const wav = encodeWav(concatPlanes(chunks, channels.length), sampleRate);
    return { result: { wav }, transfer: [wav] };
  },
});
