// 오디오만 WAV로 내보내기. 디코드는 브라우저 오디오 스레드(비동기), 이어붙이기·WAV 변환은 audio.worker.
import type { TimeRange } from '@/types/models';
import { AppError, throwIfAborted } from '@/lib/errors';
import { audioWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';

export async function exportWavRanges(
  source: Blob, ranges: TimeRange[], onProgress: (p: Progress) => void, signal: AbortSignal,
): Promise<Blob> {
  if (ranges.length === 0) throw new AppError('ENCODE_FAILED', '남은 구간이 없어 내보낼 것이 없습니다.', '구간을 다시 지정해 주세요.');
  onProgress({ phase: 'decode', done: 0, total: 2 });
  let decoded: AudioBuffer;
  try {
    decoded = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(await source.arrayBuffer());
  } catch {
    throw new AppError('NO_AUDIO_TRACK');
  }
  throwIfAborted(signal);
  const channels = Math.min(2, decoded.numberOfChannels);
  const planes = Array.from({ length: channels }, (_, c) => decoded.getChannelData(c).slice().buffer as ArrayBuffer);
  onProgress({ phase: 'render', done: 1, total: 2 });
  const { wav } = await audioWorker().call('spliceWav', { planes, sampleRate: decoded.sampleRate, ranges }, { transfer: planes, signal });
  onProgress({ phase: 'render', done: 2, total: 2 });
  return new Blob([wav], { type: 'audio/wav' });
}
