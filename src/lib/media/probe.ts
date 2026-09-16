// 미디어 메타 추출 (해상도/fps/코덱/길이). MP4·MOV는 WebCodecs 설정까지 확인하고, 그 외는 <video>로 최소 정보만.
import { AppError } from '@/lib/errors';
import { Mp4Demuxer } from '@/lib/encode/webcodecs/demux';

export interface ProbeResult {
  container: 'mp4' | 'other';
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  /** 이 브라우저의 WebCodecs가 원본 영상을 풀 수 있는가 (내보내기 경로 선택에 쓰임) */
  decodable: boolean;
}

export async function probeMp4(blob: Blob): Promise<ProbeResult> {
  const { info } = await Mp4Demuxer.open(blob);
  const { video, audio } = info;
  let decodable = false;
  if (video && typeof VideoDecoder !== 'undefined') {
    decodable = (await VideoDecoder.isConfigSupported(video.config).catch(() => ({ supported: false }))).supported === true;
  }
  return {
    container: 'mp4',
    durationMs: info.durationMs,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.fps ?? 30,
    hasVideo: !!video,
    hasAudio: !!audio,
    videoCodec: video?.codec,
    audioCodec: audio?.codec,
    sampleRate: audio?.sampleRate,
    channels: audio?.channels,
    decodable,
  };
}

/** 메인 스레드 전용 폴백. fps는 알 수 없어 30으로 가정한다 */
export function probeWithElement(file: Blob): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = () => { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const finish = () => {
        const result: ProbeResult = {
          container: 'other',
          durationMs: Math.round(video.duration * 1000),
          width: video.videoWidth,
          height: video.videoHeight,
          fps: 30,
          hasVideo: video.videoWidth > 0,
          hasAudio: true,
          decodable: false,
        };
        done();
        resolve(result);
      };
      // 일부 WebM은 길이가 Infinity로 나온다 — 끝으로 이동시키면 실제 길이가 채워진다
      if (!Number.isFinite(video.duration)) {
        video.ontimeupdate = () => { video.ontimeupdate = null; video.currentTime = 0; finish(); };
        video.currentTime = 1e9;
      } else {
        finish();
      }
    };
    video.onerror = () => {
      done();
      reject(new AppError('UNSUPPORTED_FORMAT', '이 브라우저에서 재생할 수 없는 영상입니다.', 'MP4(H.264) 파일로 변환한 뒤 올려 주세요.'));
    };
    video.src = url;
  });
}
