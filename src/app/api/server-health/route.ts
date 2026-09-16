// 서버 용량 헬스 (전역 규칙: 배터리 신호등). 이 앱의 서버는 헤더·정적 파일만 내주지만,
// 호스팅 한계로 다운되기 전에 알 수 있게 노출한다. 어떤 경우에도 이 엔드포인트 때문에 서버가 죽으면 안 된다.
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { NextResponse } from 'next/server';
import { levelFromPercent, round1, worstLevel, type HealthLevel } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MB = 1024 * 1024;

/**
 * 메모리는 "이 서버 프로세스가 쓰는 양 / 쓸 수 있는 한도"로 본다.
 * os.freemem()은 macOS·리눅스에서 파일 캐시를 사용 중으로 쳐서 늘 90%+로 나오는 거짓 경보를 만든다.
 * 컨테이너(서버리스)에서는 cgroup 한도(process.constrainedMemory)가 실제 OOM 기준이다.
 */
function memoryUsage(): { usedMB: number; totalMB: number; percent: number } {
  const limit = (process as unknown as { constrainedMemory?: () => number | undefined }).constrainedMemory?.();
  const total = limit && limit > 0 && limit < Number.MAX_SAFE_INTEGER ? Math.min(limit, os.totalmem()) : os.totalmem();
  const used = process.memoryUsage().rss;
  return { usedMB: Math.round(used / MB), totalMB: Math.round(total / MB), percent: round1((used / total) * 100) };
}

export async function GET() {
  const reasons: string[] = [];
  let memory: { usedMB: number; totalMB: number; percent: number } | null = null;
  let disk: { usedMB: number; totalMB: number; percent: number } | null = null;
  let cpuLoad1m: number | null = null;
  let uptimeSec: number | null = null;

  try {
    memory = memoryUsage();
  } catch {
    memory = null;
  }
  try {
    const s = await statfs(os.tmpdir());
    const total = s.blocks * s.bsize;
    const used = total - s.bavail * s.bsize;
    disk = total > 0 ? { usedMB: Math.round(used / MB), totalMB: Math.round(total / MB), percent: round1((used / total) * 100) } : null;
  } catch {
    disk = null;
  }
  try {
    cpuLoad1m = round1(os.loadavg()[0] ?? 0);
    uptimeSec = Math.round(process.uptime());
  } catch {
    cpuLoad1m = null;
  }

  const levels: HealthLevel[] = [levelFromPercent(memory?.percent), levelFromPercent(disk?.percent)];
  if (levelFromPercent(memory?.percent) !== 'ok') reasons.push(`메모리 ${memory?.percent}% 사용`);
  if (levelFromPercent(disk?.percent) !== 'ok') reasons.push(`디스크 ${disk?.percent}% 사용`);

  return NextResponse.json(
    { ok: true, uptimeSec, memory, cpuLoad1m, disk, level: worstLevel(levels), reason: reasons.join(', ') },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
