'use client';

// 되돌리기/다시 하기 — 화면마다 다시 만들지 않도록 한 곳에 둔다.
import { Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { redoWithToast, undoWithToast } from '@/lib/editor/actions';
import { useProjectStore } from '@/store/projectStore';

export function UndoRedo({ labeled = false }: { labeled?: boolean }) {
  const undoLabel = useProjectStore((s) => s.history.past[s.history.past.length - 1]?.label);
  const redoLabel = useProjectStore((s) => s.history.future[0]?.label);
  return (
    <>
      <Button size="sm" variant={labeled ? 'outline' : 'ghost'} disabled={!undoLabel} onClick={undoWithToast}
        title={undoLabel ? `되돌리기: ${undoLabel} (Ctrl+Z)` : '되돌릴 것이 없습니다'} aria-label="되돌리기">
        <Undo2 /> {labeled && '되돌리기'}
      </Button>
      <Button size="sm" variant="ghost" disabled={!redoLabel} onClick={redoWithToast}
        title={redoLabel ? `다시 하기: ${redoLabel} (Ctrl+Shift+Z)` : '다시 할 것이 없습니다'} aria-label="다시 하기">
        <Redo2 />
      </Button>
    </>
  );
}
