// 용량 신호등 (배터리 표시) 규칙. 서버 헬스 API와 브라우저 쪽 표시가 같은 임계값을 쓰도록 한곳에 둔다.

export type HealthLevel = 'ok' | 'warn' | 'danger' | 'critical';
export type IndicatorLevel = HealthLevel | 'offline';

export const LEVEL_COLORS: Record<IndicatorLevel, string> = {
  ok: '#43a047',
  warn: '#fbc02d',
  danger: '#f57c00',
  critical: '#e53935',
  offline: '#9e9e9e',
};

export const LEVEL_LABELS: Record<IndicatorLevel, string> = {
  ok: '여유 있음',
  warn: '주의',
  danger: '위험',
  critical: '곧 한계',
  offline: '연결 안 됨',
};

const ORDER: HealthLevel[] = ['ok', 'warn', 'danger', 'critical'];

export function levelFromPercent(percent: number | null | undefined): HealthLevel {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return 'ok';
  if (percent >= 95) return 'critical';
  if (percent >= 85) return 'danger';
  if (percent >= 70) return 'warn';
  return 'ok';
}

export function worstLevel(levels: readonly HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>((worst, l) => (ORDER.indexOf(l) > ORDER.indexOf(worst) ? l : worst), 'ok');
}

/** 배터리 채움 = 가장 많이 쓴 자원의 남은 비율 */
export function fillPercent(percents: readonly (number | null | undefined)[]): number {
  const used = percents.filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  if (used.length === 0) return 100;
  return Math.max(0, Math.min(100, 100 - Math.max(...used)));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
