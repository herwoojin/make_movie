'use client';

// 오래 걸리는 작업에는 진행률과 함께 "경과 00:08:03"을 보여 준다 (PRD-v2 F-12).
import { useEffect, useState } from 'react';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}

export function ElapsedTimer({ startedAt, className, label = '경과' }: { startedAt: number; className?: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} aria-label={`${label} 시간`}>
      {label} {formatElapsed(now - startedAt)}
    </span>
  );
}
