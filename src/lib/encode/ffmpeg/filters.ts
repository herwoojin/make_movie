// ffmpeg.wasm 폴백 경로의 명령어 조립 (TRD 4.6). select 필터로 컷을 한 번에 적용한다(concat demuxer보다 안정적).
// ffmpeg 필터 문법은 초 단위를 요구하므로, ms 정수를 여기서만 초 문자열로 바꾼다.
import type { TimeRange } from '@/types/models';

export const sec = (ms: number) => (Math.max(0, Math.round(ms)) / 1000).toFixed(3);

export function selectExpression(ranges: readonly TimeRange[]): string {
  return ranges.map((r) => `between(t,${sec(r.startMs)},${sec(r.endMs)})`).join('+');
}

export function scaleFilter(width: number, height: number, fit: 'contain' | 'cover'): string {
  return fit === 'cover'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
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
  /** 모자이크를 캔버스로 미리 구운 프레임 시퀀스 (이미 컷·자막까지 반영됨) */
  bakedFramesPattern?: string;
}

export function buildFfmpegArgs(o: FfmpegArgsOptions): string[] {
  const expr = selectExpression(o.ranges);
  // fps를 먼저 고정해야 setpts=N/FRAME_RATE/TB가 가변 프레임률 원본에서도 맞는다
  const cut = `fps=${o.fps},select='${expr}',setpts=N/FRAME_RATE/TB`;
  const audioCut = `aselect='${expr}',asetpts=N/SR/TB`;

  if (o.format === 'mp3') {
    return ['-i', o.input, '-vn', '-af', audioCut, '-c:a', 'libmp3lame', '-b:a', '192k', o.output];
  }

  if (o.format === 'gif') {
    const vf = `${cut},scale=${o.width}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer`;
    return ['-i', o.input, '-vf', vf, '-loop', '0', o.output];
  }

  if (o.bakedFramesPattern) {
    const args = ['-framerate', String(o.fps), '-i', o.bakedFramesPattern];
    if (o.hasAudio) args.push('-i', o.input, '-map', '0:v', '-map', '1:a', '-af', audioCut, '-c:a', 'aac', '-b:a', '128k');
    return [...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-shortest', '-movflags', '+faststart', o.output];
  }

  const filters = [cut, scaleFilter(o.width, o.height, o.fit)];
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
