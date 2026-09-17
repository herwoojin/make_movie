'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { ClipList } from './ClipList/ClipList';
import { ClipToolbar } from './ClipList/ClipToolbar';
import { EditorTopBar } from './EditorTopBar';
import { PanelHost } from './PanelHost';
import { PreviewCanvas } from './PreviewCanvas';
import { RelinkBanner } from './RelinkBanner';
import { TimelineRoot } from './Timeline/TimelineRoot';
import { TransportBar } from './TransportBar';
import { useEditorShortcuts } from './useEditorShortcuts';

export function EditorShell({ projectId }: { projectId: string }) {
  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const asset = useProjectStore((s) => s.asset);
  const timelineOpen = useUiStore((s) => s.timelineOpen);

  useEffect(() => {
    void useProjectStore.getState().load(projectId);
    return () => useProjectStore.getState().unload();
  }, [projectId]);

  useEffect(() => {
    if (!asset) return;
    useTimelineStore.getState().reset();
    useTimelineStore.getState().setDuration(asset.durationMs);
  }, [asset]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().saveState === 'saved') return;
      void useProjectStore.getState().flush();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEditorShortcuts(status === 'ready');

  if (status === 'error' && error) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-10 text-center">
        <p className="text-lg font-semibold">{error.message}</p>
        <p className="text-sm text-muted-foreground">👉 {error.hint}</p>
        <Button asChild><Link href="/projects">프로젝트 목록으로</Link></Button>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> 프로젝트를 여는 중…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <EditorTopBar />
      <RelinkBanner />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PanelHost />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-[180px] shrink-0 basis-[38%] bg-black/40 p-2">
            <PreviewCanvas />
          </div>
          <TransportBar />
          <ClipToolbar />
          <div className="min-h-0 flex-1">
            <ClipList />
          </div>
          {timelineOpen && <TimelineRoot />}
        </div>
      </div>
    </div>
  );
}
