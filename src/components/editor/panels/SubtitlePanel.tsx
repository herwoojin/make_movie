'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjectStore } from '@/store/projectStore';
import { OrphanCues } from './OrphanCues';
import { SubtitleFileMenu } from './SubtitleFileMenu';
import { SubtitleTextTab } from './SubtitleTextTab';
import { SubtitleTimingTab } from './SubtitleTimingTab';
import { TranscribeBox } from './TranscribeBox';

export function SubtitlePanel() {
  const count = useProjectStore((s) => s.doc.cues.filter((c) => !c.orphan).length);
  return (
    <>
      <TranscribeBox />
      <OrphanCues />
      <Tabs defaultValue="text">
        <TabsList className="w-full">
          <TabsTrigger value="text">1단계: 글자 고치기</TabsTrigger>
          <TabsTrigger value="timing">2단계: 시간 맞추기</TabsTrigger>
        </TabsList>
        <TabsContent value="text"><SubtitleTextTab /></TabsContent>
        <TabsContent value="timing"><SubtitleTimingTab /></TabsContent>
      </Tabs>
      {count === 0 && <p className="text-center text-xs text-muted-foreground">자막이 아직 없습니다. 위에서 자막을 만들거나, 자막 파일을 불러오세요.</p>}
      <SubtitleFileMenu />
    </>
  );
}
