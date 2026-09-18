// 여러 단계로 된 긴 작업의 진행률. 단계마다 무게를 두고, 지금 단계 안의 진행을 더해 전체 %를 만든다.
// 막대가 뒤로 가거나 한참 멈춰 보이지 않게 하는 것이 목적이다.
import type { Progress, ProgressDetail } from '@/lib/worker/protocol';

export interface StageDef {
  id: string;
  label: string;
  /** 전체에서 차지하는 비중 (합이 100일 필요는 없다) */
  weight: number;
}

export interface StageRun {
  stageId: string;
  /** 지금 단계 안의 진행 (0~1). undefined면 얼마나 남았는지 모르는 단계 */
  ratio?: number;
  message?: string;
  detail?: ProgressDetail;
  /** 건너뛴 단계 (예: 이미 내려받은 모델) */
  skipped?: string[];
}

export function stageIndex(stages: readonly StageDef[], id: string): number {
  return Math.max(0, stages.findIndex((s) => s.id === id));
}

/** 전체 진행 비율 (0~1) */
export function overallRatio(stages: readonly StageDef[], run: StageRun | null, done = false): number {
  if (done) return 1;
  if (!run || stages.length === 0) return 0;
  const total = stages.reduce((a, s) => a + s.weight, 0) || 1;
  const i = stageIndex(stages, run.stageId);
  const before = stages.slice(0, i).reduce((a, s) => a + s.weight, 0);
  const inside = Math.min(1, Math.max(0, run.ratio ?? 0)) * stages[i].weight;
  // 끝나기 전에는 99%를 넘기지 않는다 — 100%는 정말 끝났을 때만
  return Math.min(0.99, (before + inside) / total);
}

export type StageStatus = 'done' | 'active' | 'pending' | 'skipped';

export function stageStatus(stages: readonly StageDef[], run: StageRun | null, id: string, done = false): StageStatus {
  if (run?.skipped?.includes(id)) return 'skipped';
  if (done) return 'done';
  if (!run) return 'pending';
  const current = stageIndex(stages, run.stageId);
  const mine = stageIndex(stages, id);
  if (mine < current) return 'done';
  return mine === current ? 'active' : 'pending';
}

/** 워커 진행 메시지 → 어느 단계인지 (음성 인식 흐름용) */
export function sttStage(p: Progress): Pick<StageRun, 'stageId' | 'ratio' | 'message' | 'detail'> {
  const ratio = p.total > 0 ? p.done / p.total : undefined;
  if (p.phase === 'decode' || p.phase === 'analyze') return { stageId: 'audio', ratio, message: p.message };
  if (p.phase === 'download') return { stageId: 'model', ratio, message: p.message, detail: p.detail };
  return { stageId: 'transcribe', ratio, message: p.message, detail: p.detail };
}

/** 남은 시간 어림 (전체 비율과 경과 시간으로). 너무 이르면 모른다고 한다 */
export function remainingMs(startedAt: number, ratio: number, now = Date.now()): number | undefined {
  if (ratio < 0.03 || ratio >= 1) return undefined;
  const elapsed = now - startedAt;
  if (elapsed < 3000) return undefined;
  return Math.max(0, Math.round(elapsed / ratio - elapsed));
}
