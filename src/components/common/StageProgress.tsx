'use client';

// 오래 걸리는 작업을 "지금 무엇을 하고 있는지" 보이게 한다.
// 단계 목록(완료/진행 중/대기) + 전체 막대(끝나면 100%) + 처리 중인 구간·방금 알아들은 말 + 경과·남은 시간.
import { Check, Circle, Loader2, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { formatDuration, formatShort } from '@/lib/core/timecode';
import { overallRatio, remainingMs, stageStatus, type StageDef, type StageRun } from '@/lib/progress/stages';
import { cn } from '@/lib/utils';
import { ElapsedTimer } from './ElapsedTimer';

interface Props {
  title: string;
  stages: readonly StageDef[];
  run: StageRun | null;
  startedAt: number;
  /** 끝났으면 100%와 완료 표시 */
  done?: boolean;
  onCancel?: () => void;
  /** 방금 알아들은 말 / 번역한 문장을 부르는 이름 */
  textLabel?: string;
}

export function StageProgress({ title, stages, run, startedAt, done = false, onCancel, textLabel = '방금 알아들은 말' }: Props) {
  // 남은 시간을 매초 다시 계산한다
  const [, tick] = useState(0);
  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [done]);

  // 같은 작업 안에서는 막대가 절대 뒤로 가지 않게 한다 (새 작업을 시작하면 다시 0부터)
  const peak = useRef({ startedAt, ratio: 0 });
  if (peak.current.startedAt !== startedAt) peak.current = { startedAt, ratio: 0 };
  const ratio = Math.max(peak.current.ratio, overallRatio(stages, run, done));
  peak.current.ratio = ratio;
  const pct = Math.round(ratio * 100);
  const eta = done ? undefined : remainingMs(startedAt, ratio);
  const detail = done ? undefined : run?.detail;

  return (
    <section className="space-y-3 rounded-lg border bg-card/50 p-4" role="status" aria-live="polite" aria-label={`${title} 진행 상황`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{done ? `${title} 완료` : title}</h3>
        <span className="text-sm font-semibold tabular-nums">{pct}%</span>
      </div>

      <Progress value={pct} aria-label={`${title} 진행률`} />

      <ol className="space-y-1 text-sm">
        {stages.map((s) => {
          const status = stageStatus(stages, run, s.id, done);
          const inside = status === 'active' && run?.ratio !== undefined ? Math.round(Math.min(1, run.ratio) * 100) : null;
          return (
            <li key={s.id} className={cn('flex items-center gap-2', status === 'pending' && 'text-muted-foreground')}>
              {status === 'done' && <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />}
              {status === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />}
              {status === 'pending' && <Circle className="h-4 w-4 shrink-0" aria-hidden />}
              {status === 'skipped' && <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className={cn(status === 'active' && 'font-medium')}>{s.label}</span>
              {status === 'skipped' && <span className="text-xs text-muted-foreground">이미 준비됨</span>}
              {status === 'active' && (
                <span className="truncate text-xs text-muted-foreground">
                  {run?.message}{inside !== null && ` · ${inside}%`}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {detail?.chunks && (
        <p className="text-xs text-muted-foreground">
          구간 <b className="tabular-nums text-foreground">{detail.chunk}/{detail.chunks}</b>
          {detail.fromMs !== undefined && detail.toMs !== undefined && ` · ${formatShort(detail.fromMs)}–${formatShort(detail.toMs)}`} 처리 중
        </p>
      )}
      {detail?.text && (
        <blockquote className="rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-sm">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">{textLabel}</span>
          <span className="line-clamp-2 break-keep">{detail.text.slice(-160)}</span>
        </blockquote>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          <ElapsedTimer startedAt={startedAt} />
          {eta !== undefined && ` · 남은 시간 약 ${formatDuration(eta)}`}
        </span>
        {onCancel && !done && <Button size="sm" variant="outline" onClick={onCancel}><X /> 취소</Button>}
      </div>
    </section>
  );
}
