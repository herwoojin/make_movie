// 파일 → 모노 16kHz PCM. STT(Whisper 입력 규격)와 무음 분석이 같은 PCM을 쓰도록 한 번만 디코드한다.
// OfflineAudioContext는 워커에서 쓸 수 없는 API라 메인 스레드에서 호출하지만,
// decodeAudioData·렌더링 자체는 브라우저 오디오 스레드에서 비동기로 돌아 UI를 막지 않는다.
import { AppError, throwIfAborted } from '@/lib/errors';

export const PCM_SAMPLE_RATE = 16_000;

export interface DecodedAudio {
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
  originalSampleRate: number;
  channels: number;
}

export async function decodeToMono16k(file: Blob, signal?: AbortSignal): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer();
  throwIfAborted(signal);
  let decoded: AudioBuffer;
  try {
    const probeCtx = new OfflineAudioContext(1, 1, PCM_SAMPLE_RATE);
    decoded = await probeCtx.decodeAudioData(bytes);
  } catch {
    throw new AppError('NO_AUDIO_TRACK', '영상에서 소리를 읽지 못했습니다.', '소리가 없는 영상이거나 지원하지 않는 오디오 형식입니다. 무음 감지·자막 생성 없이 편집은 계속할 수 있습니다.');
  }
  throwIfAborted(signal);

  const length = Math.max(1, Math.ceil(decoded.duration * PCM_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(1, length, PCM_SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  // 채널 수 1인 목적지로 연결하면 스테레오가 평균(다운믹스)된다
  src.connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  throwIfAborted(signal);

  return {
    pcm: rendered.getChannelData(0),
    sampleRate: PCM_SAMPLE_RATE,
    durationMs: Math.round(decoded.duration * 1000),
    originalSampleRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
  };
}
