'use client';

import { Download, EyeOff, Palette, Scissors, Subtitles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore, type PanelId } from '@/store/uiStore';
import { AutoCutPanel } from './panels/AutoCutPanel';
import { ExportPanel } from './panels/ExportPanel';
import { MosaicPanel } from './panels/MosaicPanel';
import { StylePanel } from './panels/StylePanel';
import { SubtitlePanel } from './panels/SubtitlePanel';

export const PANELS: { id: PanelId; label: string; icon: typeof Scissors }[] = [
  { id: 'autocut', label: '자동 컷', icon: Scissors },
  { id: 'subtitle', label: '자막', icon: Subtitles },
  { id: 'style', label: '꾸미기', icon: Palette },
  { id: 'mosaic', label: '모자이크', icon: EyeOff },
  { id: 'export', label: '내보내기', icon: Download },
];

export function PanelHost() {
  const panel = useUiStore((s) => s.panel);
  const setPanel = useUiStore((s) => s.setPanel);
  return (
    <aside className="flex max-h-[45vh] shrink-0 flex-col border-b lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r" aria-label="편집 기능">
      <div role="tablist" aria-label="기능 선택" className="flex border-b">
        {PANELS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={panel === id}
            aria-controls={`panel-${id}`}
            title={`${label} (${i + 1})`}
            onClick={() => setPanel(id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-xs transition-colors',
              panel === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div id={`panel-${panel}`} role="tabpanel" className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {panel === 'autocut' && <AutoCutPanel />}
        {panel === 'subtitle' && <SubtitlePanel />}
        {panel === 'style' && <StylePanel />}
        {panel === 'mosaic' && <MosaicPanel />}
        {panel === 'export' && <ExportPanel />}
      </div>
    </aside>
  );
}
