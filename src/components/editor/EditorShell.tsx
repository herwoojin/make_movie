'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { SessionGate } from '@/components/pipeline/SessionGate';
import { useUiStore, type PanelId } from '@/store/uiStore';
import { ClipList } from './ClipList/ClipList';
import { ClipToolbar } from './ClipList/ClipToolbar';
import { EditorTopBar } from './EditorTopBar';
import { PanelHost } from './PanelHost';
import { PreviewCanvas } from './PreviewCanvas';
import { ProjectPanel } from './ProjectPanel';
import { RelinkBanner } from './RelinkBanner';
import { TimelineRoot } from './Timeline/TimelineRoot';
import { TransportBar } from './TransportBar';
import { useProjectSession } from './useProjectSession';

const PANEL_IDS = new Set<string>(['autocut', 'subtitle', 'style', 'mosaic', 'export']);

export function EditorShell({ projectId }: { projectId: string }) {
  const { status, error } = useProjectSession(projectId);
  const timelineOpen = useUiStore((s) => s.timelineOpen);
  // 다른 화면(얼굴 모자이크 등)에서 들어올 때 열어 둘 패널을 지정할 수 있다
  const wanted = useSearchParams().get('panel');

  useEffect(() => {
    if (wanted && PANEL_IDS.has(wanted)) useUiStore.getState().setPanel(wanted as PanelId);
  }, [wanted]);

  return (
    <SessionGate status={status} error={error}>
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <EditorTopBar undo={false} />
        <RelinkBanner />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 shrink-0 flex-col lg:w-[400px]">
            <PanelHost />
            <ProjectPanel />
          </div>
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
    </SessionGate>
  );
}
