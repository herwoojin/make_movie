// 메인 스레드용 probe: moov 파싱은 워커에서, 실패하면 <video> 메타데이터로 폴백.
import { encodeWorker } from '@/lib/worker/instances';
import { probeWithElement, type ProbeResult } from './probe';

export function isMp4Like(file: { name: string; type: string }): boolean {
  return /\.(mp4|mov|m4v)$/i.test(file.name) || /video\/(mp4|quicktime)/.test(file.type);
}

export async function probeMedia(file: File): Promise<ProbeResult> {
  if (isMp4Like(file)) {
    try {
      const result = await encodeWorker().call('probe', { file });
      if (result.hasVideo && result.durationMs > 0) return result;
    } catch {
      // 확장자만 mp4이고 실제 구조가 다른 파일 — 브라우저 재생기로 확인
    }
  }
  return probeWithElement(file);
}
