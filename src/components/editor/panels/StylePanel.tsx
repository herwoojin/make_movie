'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUiStore } from '@/store/uiStore';
import { AspectControls } from './AspectControls';
import { SpeedControls } from './SpeedControls';
import { StyleControls } from './StyleControls';
import { StylePresets } from './StylePresets';
import { StyleScopeToggle } from './StyleScopeToggle';

export function StylePanel() {
  const tab = useUiStore((s) => s.stylePanelTab);
  return (
    <Tabs value={tab} onValueChange={(v) => useUiStore.getState().openStylePanel(v as 'style' | 'speed')}>
      <TabsList className="w-full">
        <TabsTrigger value="style">자막 서식</TabsTrigger>
        <TabsTrigger value="speed">배속</TabsTrigger>
      </TabsList>

      <TabsContent value="style" className="space-y-3">
        <AspectControls />
        <StyleScopeToggle />
        <p className="text-xs text-muted-foreground">
          바꾸는 즉시 미리보기에 보입니다. 미리보기와 내보낸 영상은 같은 그리기 함수를 쓰므로 모양이 같게 나옵니다.
        </p>
        <StylePresets />
        <StyleControls />
      </TabsContent>

      <TabsContent value="speed" className="space-y-3">
        <SpeedControls />
      </TabsContent>
    </Tabs>
  );
}
