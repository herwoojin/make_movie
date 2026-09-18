'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/misc';
import { clipSpeedRanges } from '@/lib/core/clips';
import { formatDuration } from '@/lib/core/timecode';
import { outputDurationMs } from '@/lib/core/edl';
import { useProjectStore } from '@/store/projectStore';
import { UndoRedo } from './UndoRedo';

/** undo: 되돌리기 버튼을 여기에 둘지 (2단계는 클립 툴바에 있어서 끈다) */
export function EditorTopBar({ undo = true }: { undo?: boolean }) {
  const project = useProjectStore((s) => s.project);
  const saveState = useProjectStore((s) => s.saveState);
  const analysis = useProjectStore((s) => s.analysis);
  const outMs = useProjectStore((s) => outputDurationMs(s.doc.edl, clipSpeedRanges(s.doc.clips), s.doc.view.globalSpeed));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-1.5 text-sm">
      <h1 className="max-w-[40vw] truncate font-semibold" title={project?.name}>{project?.name}</h1>
      <span className="text-xs text-muted-foreground">
        원본 {formatDuration(project?.sourceDurationMs ?? 0)} → 결과 {formatDuration(outMs)}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        {saveState === 'saved' && <><Check className="h-3.5 w-3.5 text-emerald-400" /> 자동 저장됨</>}
        {(saveState === 'pending' || saveState === 'saving') && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 저장 중</>}
        {saveState === 'failed' && <><AlertTriangle className="h-3.5 w-3.5 text-red-400" /> 저장 실패</>}
      </span>
      {analysis && (
        <div className="flex min-w-[12rem] items-center gap-2 text-xs" role="status">
          <span className="whitespace-nowrap text-muted-foreground">{analysis.label}</span>
          <Progress value={Math.round(analysis.ratio * 100)} className="h-1.5 w-24" aria-label="소리 분석 진행률" />
        </div>
      )}
      {undo && <div className="ml-auto flex items-center gap-1"><UndoRedo /></div>}
    </div>
  );
}
