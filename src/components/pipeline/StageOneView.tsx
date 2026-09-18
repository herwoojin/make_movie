'use client';

// 1단계 · 음성 자동편집. 그 자체로 완결된다 — 자동편집한 영상만 저장하고 끝내도 되고, 2단계로 넘겨도 된다.
import { ArrowRight, Download, Scissors } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EditorTopBar } from '@/components/editor/EditorTopBar';
import { PreviewCanvas } from '@/components/editor/PreviewCanvas';
import { RelinkBanner } from '@/components/editor/RelinkBanner';
import { TimelineRoot } from '@/components/editor/Timeline/TimelineRoot';
import { TransportBar } from '@/components/editor/TransportBar';
import { AutoCutPanel } from '@/components/editor/panels/AutoCutPanel';
import { ExportPanel } from '@/components/editor/panels/ExportPanel';
import { useProjectSession } from '@/components/editor/useProjectSession';
import { Button } from '@/components/ui/button';
import { setPipelineStage } from '@/lib/storage/projectRepo';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { SessionGate } from './SessionGate';

type Tab = 'autocut' | 'export';

const TABS: { id: Tab; label: string; icon: typeof Scissors }[] = [
  { id: 'autocut', label: '자동 컷', icon: Scissors },
  { id: 'export', label: '자동편집 영상 저장', icon: Download },
];

export function StageOneView({ projectId }: { projectId: string }) {
  const { status, error } = useProjectSession(projectId);
  const [tab, setTab] = useState<Tab>('autocut');
  const router = useRouter();

  const sendToStageTwo = async () => {
    await useProjectStore.getState().flush();
    await setPipelineStage(projectId, 2);
    router.push(`/editor/${projectId}`);
  };

  return (
    <SessionGate status={status} error={error}>
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <EditorTopBar />
        <RelinkBanner />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="flex max-h-[45vh] shrink-0 flex-col border-b lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r" aria-label="1단계 기능">
            <div role="tablist" aria-label="기능 선택" className="flex border-b">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} role="tab" type="button" aria-selected={tab === id} aria-controls={`stage1-${id}`} onClick={() => setTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs transition-colors',
                    tab === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}>
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <div id={`stage1-${tab}`} role="tabpanel" className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {tab === 'autocut' ? <AutoCutPanel /> : <ExportPanel />}
            </div>
            <div className="shrink-0 space-y-1.5 border-t p-3">
              <Button className="w-full" onClick={() => void sendToStageTwo()}>
                2단계로 보내기 <ArrowRight />
              </Button>
              <p className="text-[11px] text-muted-foreground">
                영상을 다시 만들지 않고 그대로 넘어갑니다. 2단계에서 자막·서식·배속·화면 비율을 다룹니다.
              </p>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative min-h-[180px] flex-1 bg-black/40 p-2">
              <PreviewCanvas />
            </div>
            <TransportBar />
            <TimelineRoot />
          </div>
        </div>
      </div>
    </SessionGate>
  );
}
