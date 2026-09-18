// 마이크 녹음 → 48kHz/16bit/모노 WAV (F-08-2). 브라우저만으로 된다.
import { audioBufferToWav } from '@/lib/audio/mix';
import { AppError } from '@/lib/errors';

export const TARGET_SAMPLE_RATE = 48_000;

export interface MicDevice {
  deviceId: string;
  label: string;
}

/** 권한을 받기 전에는 장치 이름이 비어 있으므로, 권한 요청 뒤에 다시 부른다 */
export async function listMicrophones(): Promise<MicDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `마이크 ${i + 1}` }));
}

export async function requestMicPermission(deviceId?: string): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new AppError('UNSUPPORTED_BROWSER', '이 브라우저에서는 녹음할 수 없습니다.', 'Chrome·Edge 최신 버전을 써 주세요.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId }, channelCount: 1 } : { channelCount: 1 },
    });
  } catch {
    throw new AppError('UNSUPPORTED_BROWSER', '마이크를 쓸 수 없습니다.', '브라우저 주소창의 마이크 권한을 허용해 주세요.');
  }
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(deviceId?: string): Promise<void> {
    this.stream = await requestMicPermission(deviceId);
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(200);
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** 녹음을 멈추고 48kHz 모노 WAV로 바꾼다 */
  async stop(): Promise<{ wav: Blob; durationMs: number }> {
    const recorder = this.recorder;
    if (!recorder) throw new AppError('UNKNOWN', '녹음 중이 아닙니다.');
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      recorder.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    return toMonoWav(blob);
  }

  cancel(): void {
    try {
      if (this.recorder?.state === 'recording') this.recorder.stop();
    } catch {
      // 이미 멈춘 상태
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}

/** 어떤 오디오든 48kHz 모노 16bit WAV로 맞춘다 (음성 복제 모델이 바라는 형식) */
export async function toMonoWav(input: Blob): Promise<{ wav: Blob; durationMs: number }> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await input.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const frames = Math.max(1, Math.round((decoded.duration * TARGET_SAMPLE_RATE)));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const mono = await offline.startRendering();
  return { wav: audioBufferToWav(mono), durationMs: Math.round(mono.duration * 1000) };
}
