// 인코딩 워커: 메타 추출(probe)과 WebCodecs 렌더. 영상 한 편 전체를 다루는 연산은 전부 여기서.
import { renderWithWebCodecs, type RenderResult } from '@/lib/encode/webcodecs/render';
import type { RenderJob } from '@/lib/encode/types';
import { probeMp4, type ProbeResult } from '@/lib/media/probe';
import { serve } from '@/lib/worker/serve';

export type EncodeWorkerApi = {
  probe: { payload: { file: Blob }; result: ProbeResult };
  render: { payload: { file: Blob; job: RenderJob; outPath?: string }; result: RenderResult };
};

serve<EncodeWorkerApi>({
  async probe({ file }) {
    return { result: await probeMp4(file) };
  },
  async render({ file, job, outPath }, { signal, progress }) {
    const result = await renderWithWebCodecs(file, job, outPath, progress, signal);
    return { result, transfer: result.buffer ? [result.buffer] : [] };
  },
});
