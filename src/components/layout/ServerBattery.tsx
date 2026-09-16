'use client';

// 우측 하단 배터리: 서버 용량 + (이 앱은 브라우저가 실제 작업장이므로) 브라우저 저장공간·탭 메모리까지 함께 보여준다.
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fillPercent, LEVEL_COLORS, LEVEL_LABELS, levelFromPercent, worstLevel, type HealthLevel, type IndicatorLevel } from '@/lib/health';
import { cn, formatBytes } from '@/lib/utils';

interface ServerHealth {
  uptimeSec: number | null;
  memory: { usedMB: number; totalMB: number; percent: number } | null;
  disk: { usedMB: number; totalMB: number; percent: number } | null;
  cpuLoad1m: number | null;
  level: HealthLevel;
}

interface BrowserHealth {
  storagePct: number | null;
  storageUsed: number;
  storageQuota: number;
  heapPct: number | null;
  heapUsedMB: number | null;
}

const POLL_MS = 30_000;
const ANIM: Record<IndicatorLevel, string> = {
  ok: '',
  warn: 'animate-[battery-breathe_3s_ease-in-out_infinite]',
  danger: 'animate-[battery-pulse_1.2s_ease-in-out_infinite]',
  critical: 'animate-[battery-pulse_0.6s_ease-in-out_infinite]',
  offline: '',
};

async function readBrowser(): Promise<BrowserHealth> {
  let storageUsed = 0;
  let storageQuota = 0;
  try {
    const est = await navigator.storage?.estimate?.();
    storageUsed = est?.usage ?? 0;
    storageQuota = est?.quota ?? 0;
  } catch { /* 지원 안 함 */ }
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return {
    storagePct: storageQuota > 0 ? (storageUsed / storageQuota) * 100 : null,
    storageUsed,
    storageQuota,
    heapPct: mem ? (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100 : null,
    heapUsedMB: mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null,
  };
}

export function ServerBattery() {
  const [server, setServer] = useState<ServerHealth | null>(null);
  const [browser, setBrowser] = useState<BrowserHealth | null>(null);
  const [failures, setFailures] = useState(0);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);

  const poll = useCallback(async (force = false) => {
    if (busy.current || (!force && document.hidden)) return;
    busy.current = true;
    try {
      setBrowser(await readBrowser());
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch('/api/server-health', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      setServer((await res.json()) as ServerHealth);
      setFailures(0);
    } catch {
      setFailures((f) => f + 1);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void poll(true);
    const id = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  const offline = failures >= 3;
  const level: IndicatorLevel = offline ? 'offline' : worstLevel([
    server?.level ?? 'ok', levelFromPercent(browser?.storagePct), levelFromPercent(browser?.heapPct),
  ]);
  const fill = offline ? 0 : fillPercent([server?.memory?.percent, server?.disk?.percent, browser?.storagePct, browser?.heapPct]);
  const color = LEVEL_COLORS[level];

  return (
    <div className="fixed z-50" style={{ right: 'calc(12px + env(safe-area-inset-right))', bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      {open && (
        <div role="dialog" aria-label="용량 상태" className="absolute bottom-8 right-0 w-64 space-y-2 rounded-lg border bg-card p-3 text-xs shadow-2xl">
          <p className="text-sm font-semibold" style={{ color }}>{LEVEL_LABELS[level]}</p>
          <Row label="서버 메모리" value={server?.memory ? `${server.memory.usedMB}MB / ${server.memory.totalMB}MB (${server.memory.percent}%)` : '-'} />
          <Row label="서버 디스크" value={server?.disk ? `${server.disk.percent}%` : '-'} />
          <Row label="서버 CPU 부하(1분)" value={server?.cpuLoad1m ?? '-'} />
          <Row label="서버 가동 시간" value={server?.uptimeSec != null ? `${Math.round(server.uptimeSec / 60)}분` : '-'} />
          <hr className="border-border" />
          <Row label="브라우저 저장공간" value={browser?.storageQuota ? `${formatBytes(browser.storageUsed)} / ${formatBytes(browser.storageQuota)}` : '-'} />
          <Row label="이 탭 메모리" value={browser?.heapUsedMB != null ? `${browser.heapUsedMB}MB (${Math.round(browser.heapPct ?? 0)}%)` : '측정 불가'} />
          {offline && (
            <button type="button" onClick={() => { setFailures(0); void poll(true); }} className="mt-1 inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
              <RefreshCw className="h-3 w-3" /> 다시 연결
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`용량 상태: ${LEVEL_LABELS[level]}, 여유 ${Math.round(fill)}%`}
        className={cn('flex items-center rounded-md bg-card/80 p-1 shadow-lg backdrop-blur', ANIM[level])}
      >
        <svg width="38" height="20" viewBox="0 0 38 20" aria-hidden>
          <rect x="1" y="2" width="32" height="16" rx="3" fill="none" stroke={color} strokeWidth="2" />
          <rect x="34" y="7" width="3" height="6" rx="1" fill={color} />
          <rect x="4" y="5" width={Math.max(0, (26 * fill) / 100)} height="10" rx="1.5" fill={color} />
          {offline && <text x="17" y="14.5" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>!</text>}
        </svg>
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
