'use client';

// 화면 아래 고정 상태 바 (PRD-v2 F-12): 준비 완료 / 처리 중 / 저장 완료 · 경로.
// 오른쪽 아래 배터리 표시와 겹치지 않도록 여백을 둔다.
import { AlertTriangle, Check, Circle, FolderOpen, Loader2 } from 'lucide-react';
import { ElapsedTimer } from '@/components/common/ElapsedTimer';
import { openSavedFolder } from '@/lib/storage/saveTarget';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function StatusBar() {
  const status = useUiStore((s) => s.status);

  const Icon = status.kind === 'busy' ? Loader2 : status.kind === 'done' ? Check : status.kind === 'error' ? AlertTriangle : Circle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-background/90 px-3 py-1 pr-24 text-xs backdrop-blur"
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          status.kind === 'busy' && 'animate-spin text-primary',
          status.kind === 'done' && 'text-emerald-400',
          status.kind === 'error' && 'text-red-400',
          status.kind === 'idle' && 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className={cn('truncate', status.kind === 'idle' ? 'text-muted-foreground' : 'text-foreground')}>{status.text}</span>
      {status.hint && <span className="hidden truncate text-muted-foreground sm:inline">· {status.hint}</span>}
      {status.kind === 'busy' && status.startedAt && <ElapsedTimer startedAt={status.startedAt} className="tabular-nums text-muted-foreground" />}
      {status.kind === 'done' && status.hint && (
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => { void openSavedFolder(); }}
        >
          <FolderOpen className="h-3 w-3" aria-hidden /> 폴더 열기
        </button>
      )}
    </div>
  );
}
