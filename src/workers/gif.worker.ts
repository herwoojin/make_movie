// 도구함 GIF 인코딩 워커. 메인 스레드가 프레임(ImageBitmap)을 떠서 조금씩 보내고, 여기서 팔레트·LZW 압축을 한다.
import { AppError } from '@/lib/errors';
import { buildPalette, GifEncoder } from '@/lib/gif/encoder';
import { serve } from '@/lib/worker/serve';

export type GifWorkerApi = {
  start: { payload: { session: string; width: number; height: number; delayMs: number; frames: ImageBitmap[] }; result: { frames: number } };
  add: { payload: { session: string; frames: ImageBitmap[] }; result: { frames: number } };
  finish: { payload: { session: string }; result: { buffer: ArrayBuffer } };
};

interface Session {
  encoder: GifEncoder;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  delayMs: number;
  count: number;
}

const sessions = new Map<string, Session>();

function pixels(ctx: OffscreenCanvasRenderingContext2D, bitmap: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h).data;
}

serve<GifWorkerApi>({
  async start({ session, width, height, delayMs, frames }) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new AppError('ENCODE_FAILED', '그리기 화면(캔버스)을 만들 수 없습니다.');
    const px = frames.map((f) => pixels(ctx, f, width, height));
    const encoder = new GifEncoder(width, height, buildPalette(px, 256));
    for (const p of px) encoder.addFrame(p, delayMs);
    sessions.set(session, { encoder, canvas, ctx, delayMs, count: px.length });
    return { result: { frames: px.length } };
  },

  async add({ session, frames }) {
    const s = sessions.get(session);
    if (!s) throw new AppError('ENCODE_FAILED', 'GIF 작업이 시작되지 않았습니다.', '다시 시도해 주세요.');
    for (const f of frames) {
      s.encoder.addFrame(pixels(s.ctx, f, s.canvas.width, s.canvas.height), s.delayMs);
      s.count++;
    }
    return { result: { frames: s.count } };
  },

  async finish({ session }) {
    const s = sessions.get(session);
    if (!s) throw new AppError('ENCODE_FAILED', 'GIF 작업이 시작되지 않았습니다.', '다시 시도해 주세요.');
    sessions.delete(session);
    const bytes = s.encoder.finish();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { result: { buffer }, transfer: [buffer] };
  },
});
