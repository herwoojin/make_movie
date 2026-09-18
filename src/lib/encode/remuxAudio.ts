// 영상은 그대로 두고 소리만 갈아 끼운다 (F-06).
// 영상 스트림을 다시 압축하지 않으므로(-c:v copy) 길이가 길어도 몇 초면 끝나고 화질도 그대로다.
import { AppError, toAppError } from '@/lib/errors';
import type { Progress } from '@/lib/worker/protocol';
import { parseFfmpegTime } from './ffmpeg/filters';
import { loadFfmpeg, resetFfmpeg } from './ffmpeg';

export async function replaceAudioTrack(
  video: File, wav: Blob, durationMs: number, onProgress: (p: Progress) => void, signal: AbortSignal,
): Promise<Blob> {
  const ff = await loadFfmpeg();
  const onAbort = () => resetFfmpeg();
  signal.addEventListener('abort', onAbort, { once: true });
  const onLog = ({ message }: { message: string }) => {
    const t = parseFfmpegTime(message);
    if (t !== null) onProgress({ phase: 'mux', done: Math.min(durationMs, t), total: Math.max(1, durationMs) });
  };
  ff.on('log', onLog);
  try {
    await ff.writeFile('/in.mp4', new Uint8Array(await video.arrayBuffer()));
    await ff.writeFile('/mix.wav', new Uint8Array(await wav.arrayBuffer()));
    const code = await ff.exec([
      '-i', '/in.mp4', '-i', '/mix.wav',
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
      '-movflags', '+faststart', '/out.mp4',
    ]);
    if (code !== 0) throw new AppError('ENCODE_FAILED', '소리를 입히는 중 문제가 생겼습니다.', '다른 오디오 파일로 시도하거나 영상을 MP4로 바꿔 주세요.');
    const data = await ff.readFile('/out.mp4');
    if (typeof data === 'string') throw new AppError('ENCODE_FAILED');
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
  } catch (e) {
    if (signal.aborted) throw new AppError('ABORTED');
    throw toAppError(e, 'ENCODE_FAILED');
  } finally {
    signal.removeEventListener('abort', onAbort);
    ff.off('log', onLog);
    await ff.deleteFile('/in.mp4').catch(() => undefined);
    await ff.deleteFile('/mix.wav').catch(() => undefined);
    await ff.deleteFile('/out.mp4').catch(() => undefined);
  }
}
