// ffmpeg.wasm 폴백 경로의 명령어 조립 (TRD 4.6). select 필터로 컷을 한 번에 적용한다(concat demuxer보다 안정적).
// ffmpeg 필터 문법은 초 단위를 요구하므로, ms 정수를 여기서만 초 문자열로 바꾼다.
import type { TimeRange } from '@/types/models';
import { fitModeOf, fitRect, type FrameView } from '@/lib/render/frame';

export const sec = (ms: number) => (Math.max(0, Math.round(ms)) / 1000).toFixed(3);

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function selectExpression(ranges: readonly TimeRange[]): string {
  return ranges.map((r) => `between(t,${sec(r.startMs)},${sec(r.endMs)})`).join('+');
}

/**
 * 화면 비율·채움 방식을 미리보기와 같게 만드는 필터 (F-04).
 * blur는 ffmpeg.wasm 기본 코어에 있는 boxblur를 쓴다(gblur는 빠져 있다).
 */
export function frameFilter(
  width: number, height: number, fit: 'contain' | 'cover', view?: FrameView, srcWidth = 0, srcHeight = 0,
): string {
  const v: FrameView = view
    ? { ...view, fallbackFit: fit }
    : { aspectMode: 'original', fillMode: 'blur', reframe: { x: 0.5, y: 0.5, scale: 1 }, fallbackFit: fit };

  if (fitModeOf(v) === 'cover') {
    // 보여줄 영역(reframe)을 픽셀로 계산해 그대로 잘라낸다
    const r = fitRect(srcWidth, srcHeight, width, height, 'cover', v.reframe);
    if (srcWidth > 0 && srcHeight > 0) {
      return `scale=${even(r.dw)}:${even(r.dh)},crop=${width}:${height}:${Math.max(0, Math.round(-r.dx))}:${Math.max(0, Math.round(-r.dy))}`;
    }
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }

  const contain = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
  if (v.aspectMode !== 'original' && v.fillMode === 'blur') {
    const radius = Math.max(2, Math.round(Math.min(width, height) / 25));
    return [
      'split[bgin][fgin]',
      `[bgin]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=${radius}:luma_power=2:chroma_radius=${Math.max(2, Math.round(radius / 2))}:chroma_power=1[bg]`,
      `[fgin]${contain}[fg]`,
      '[bg][fg]overlay=(W-w)/2:(H-h)/2',
    ].join(';');
  }
  return `${contain},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
}

export interface FfmpegArgsOptions {
  input: string;
  output: string;
  ranges: readonly TimeRange[];
  width: number;
  height: number;
  fps: number;
  fit: 'contain' | 'cover';
  format: 'mp4' | 'gif' | 'mp3';
  hasAudio: boolean;
  bitrate: number;
  assPath?: string;
  fontsDir?: string;
  /** 모자이크를 캔버스로 미리 구운 프레임 시퀀스 (이미 컷·자막·비율까지 반영됨) */
  bakedFramesPattern?: string;
  /** 영상 전체에 같은 배속이 걸렸을 때만 (클립마다 다른 배속은 기본 인코더가 처리한다) */
  speed?: number;
  /** 음정 유지 — atempo는 음정을 유지한다. 끄면 샘플레이트를 바꿔 톤이 함께 변한다 */
  pitchPreserve?: boolean;
  view?: FrameView;
  srcWidth?: number;
  srcHeight?: number;
}

/** atempo는 0.5~2.0만 받으므로 그 밖의 배속은 여러 번 나눠 건다 */
export function atempoChain(speed: number): string {
  let left = speed;
  const parts: string[] = [];
  while (left > 2.000001) {
    parts.push('atempo=2.0');
    left /= 2;
  }
  while (left < 0.499999) {
    parts.push('atempo=0.5');
    left *= 2;
  }
  parts.push(`atempo=${left.toFixed(4)}`);
  return parts.join(',');
}

export function buildFfmpegArgs(o: FfmpegArgsOptions): string[] {
  const expr = selectExpression(o.ranges);
  const speed = o.speed && o.speed > 0 && Math.abs(o.speed - 1) > 0.001 ? o.speed : 1;
  // fps를 먼저 고정해야 setpts=N/FRAME_RATE/TB가 가변 프레임률 원본에서도 맞는다
  const cut = `fps=${o.fps},select='${expr}',setpts=N/FRAME_RATE/TB${speed !== 1 ? `,setpts=PTS/${speed}` : ''}`;
  const audioSpeed = speed === 1
    ? ''
    : o.pitchPreserve === false
      ? `,asetrate=48000*${speed},aresample=48000`
      : `,${atempoChain(speed)}`;
  const audioCut = `aselect='${expr}',asetpts=N/SR/TB${audioSpeed}`;

  if (o.format === 'mp3') {
    return ['-i', o.input, '-vn', '-af', audioCut, '-c:a', 'libmp3lame', '-b:a', '192k', o.output];
  }

  const frame = frameFilter(o.width, o.height, o.fit, o.view, o.srcWidth, o.srcHeight);

  if (o.format === 'gif') {
    const vf = `${cut},${frame},split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer`;
    return ['-i', o.input, '-vf', vf, '-loop', '0', o.output];
  }

  if (o.bakedFramesPattern) {
    const args = ['-framerate', String(o.fps), '-i', o.bakedFramesPattern];
    if (o.hasAudio) args.push('-i', o.input, '-map', '0:v', '-map', '1:a', '-af', audioCut, '-c:a', 'aac', '-b:a', '128k');
    return [...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-shortest', '-movflags', '+faststart', o.output];
  }

  const filters = [cut, frame];
  if (o.assPath) filters.push(`subtitles=${o.assPath}${o.fontsDir ? `:fontsdir=${o.fontsDir}` : ''}`);
  const args = ['-i', o.input, '-vf', filters.join(',')];
  if (o.hasAudio) args.push('-af', audioCut, '-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  return [...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o.output];
}

/** ffmpeg 로그의 time=HH:MM:SS.cc 를 ms로 */
export function parseFfmpegTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(line);
  if (!m) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac) * 1000);
}

/** wasm 인코딩 소요 시간 대략 추정. 멀티스레드 1080p ultrafast ≈ 실시간의 1.5배, 단일 스레드는 그 3배 */
export function estimateFfmpegMs(outputMs: number, width: number, height: number, multiThread: boolean): number {
  const pixels = Math.max(1, (width * height) / (1920 * 1080));
  return Math.round(outputMs * 1.5 * pixels * (multiThread ? 1 : 3));
}
