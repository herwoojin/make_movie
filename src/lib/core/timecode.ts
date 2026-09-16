// 시간은 저장·계산 모두 ms 정수. 여기는 "표시"와 "프레임 스냅"만 담당한다 (ERD 6.1).

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, '0');

/** 00:03:12 또는 00:03:12.345 */
export function formatTimecode(ms: number, withMs = false): string {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3_600_000);
  const m = Math.floor((safe % 3_600_000) / 60_000);
  const s = Math.floor((safe % 60_000) / 1000);
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return withMs ? `${base}.${pad(safe % 1000, 3)}` : base;
}

/** 목록용 짧은 표기: 3:12.4 */
export function formatShort(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const m = Math.floor(safe / 60_000);
  const s = Math.floor((safe % 60_000) / 1000);
  const tenth = Math.floor((safe % 1000) / 100);
  return `${m}:${pad(s)}.${tenth}`;
}

/** 사람이 읽는 길이: "0.8초", "1분 5초" */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)}초`;
  const m = Math.floor(safe / 60_000);
  const s = Math.round((safe % 60_000) / 1000);
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** "00:01:02.500", "01:02.5", "62.5" 모두 허용. 해석 불가면 null */
export function parseTimecode(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return null;
  const [main, frac = ''] = t.split('.');
  const parts = main.split(':').map(Number);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  const msFrac = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return sec * 1000 + msFrac;
}

export function frameDurationMs(fps: number): number {
  return 1000 / (fps > 0 ? fps : 30);
}

export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms * (fps > 0 ? fps : 30)) / 1000);
}

export function frameToMs(frame: number, fps: number): number {
  return Math.round((frame * 1000) / (fps > 0 ? fps : 30));
}

export function snapToFrame(ms: number, fps: number): number {
  return frameToMs(msToFrame(ms, fps), fps);
}

export function clampMs(ms: number, min: number, max: number): number {
  return Math.round(Math.min(Math.max(ms, min), max));
}
