'use client';

import { Play } from 'lucide-react';
import type { CutSuggestion, TimeRange } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { formatDuration, formatShort } from '@/lib/core/timecode';
import { seekTo } from '@/lib/editor/actions';
import { player } from '@/lib/editor/player';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';

/** 적용 여부는 EDL에서 계산한다 — Ctrl+Z로 EDL이 돌아가면 목록 표시도 자동으로 돌아간다 */
export function isApplied(s: Pick<CutSuggestion, 'startMs' | 'endMs'>, removed: readonly TimeRange[]): boolean {
  return removed.some((r) => r.startMs <= s.startMs && r.endMs >= s.endMs);
}

function setDecision(ids: Set<string> | 'all', decision: CutSuggestion['decision']): void {
  const { suggestions, setSuggestions } = useProjectStore.getState();
  setSuggestions(suggestions.map((s) => (ids === 'all' || ids.has(s.id) ? { ...s, decision } : s)));
}

export function SuggestionList({ suggestions, removed }: { suggestions: CutSuggestion[]; removed: TimeRange[] }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        <Button size="sm" variant="ghost" onClick={() => setDecision('all', 'pending')}>모두 자르기</Button>
        <Button size="sm" variant="ghost" onClick={() => setDecision('all', 'rejected')}>모두 살리기</Button>
      </div>
      <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="자를 제안 목록">
        {suggestions.map((s) => {
          const applied = isApplied(s, removed);
          const cut = s.decision !== 'rejected';
          return (
            <li key={s.id} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs', applied && 'opacity-60')}>
              <button
                type="button"
                aria-pressed={cut}
                disabled={applied}
                onClick={() => setDecision(new Set([s.id]), cut ? 'rejected' : 'pending')}
                className={cn('w-14 shrink-0 rounded px-1.5 py-1 font-medium', cut ? 'bg-red-500/80 text-white' : 'bg-secondary text-muted-foreground')}
              >
                {cut ? '자르기' : '살리기'}
              </button>
              <button type="button" className="min-w-0 flex-1 text-left tabular-nums" onClick={() => seekTo(s.startMs)}>
                {formatShort(s.startMs)} – {formatShort(s.endMs)}
                <span className="ml-1 text-muted-foreground">({formatDuration(s.endMs - s.startMs)})</span>
                {s.label && <span className="ml-1 text-orange-300">“{s.label}”</span>}
              </button>
              {applied && <Badge tone="muted">적용됨</Badge>}
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="앞뒤 포함해서 미리듣기"
                onClick={() => player.playRange(Math.max(0, s.startMs - 800), s.endMs + 800)}>
                <Play />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
