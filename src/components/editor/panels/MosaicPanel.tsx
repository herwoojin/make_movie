'use client';

import { Loader2, ScanFace, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Progress, Switch } from '@/components/ui/misc';
import { scanFaces } from '@/lib/editor/faceScan';
import { progressRatio, type Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { MosaicControls } from './MosaicControls';
import { PersonList } from './PersonList';

export function MosaicPanel() {
  const autoCount = useProjectStore((s) => s.doc.tracks.filter((t) => t.createdBy === 'auto').length);
  const drawing = useUiStore((s) => s.drawMosaic);
  const previewMosaic = useUiStore((s) => s.previewMosaic);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scan = async () => {
    const { project, asset, source } = useProjectStore.getState();
    if (!project || !asset || !source) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ phase: 'detect', done: 0, total: 1 });
    try {
      const res = await scanFaces(project.id, asset, source, 0, setProgress, ctrl.signal);
      useProjectStore.getState().edit('얼굴 자동 검출', (d) => {
        d.tracks = [...d.tracks.filter((t) => t.createdBy === 'manual'), ...res.tracks];
      });
      useProjectStore.getState().setMosaicHoldMs(res.holdMs);
      useUiStore.getState().toast(res.tracks.length
        ? { kind: 'success', title: `${res.tracks.length}명(개)의 얼굴을 찾았습니다.`, hint: '본인처럼 가리지 않을 사람은 목록에서 스위치를 끄세요.' }
        : { kind: 'info', title: '얼굴을 찾지 못했습니다.', hint: '얼굴이 작거나 옆모습이면 놓칠 수 있습니다. 미리보기에 직접 네모를 그려 가려 주세요.' });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Section title="얼굴 자동 찾기" description="영상 전체에서 얼굴을 찾아 인물별로 따라다니며 가립니다. 5프레임마다 찾고 사이를 부드럽게 이어 붙입니다. 영상은 이 컴퓨터 밖으로 나가지 않습니다.">
        {progress ? (
          <div className="space-y-2" role="status">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> 얼굴 찾는 중 {Math.round(progressRatio(progress) * 100)}%</p>
            <Progress value={progressRatio(progress) * 100} aria-label="얼굴 찾기 진행률" />
            <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>취소</Button>
          </div>
        ) : (
          <Button onClick={() => void scan()}><ScanFace /> {autoCount ? '얼굴 다시 찾기' : '얼굴 찾기'}</Button>
        )}
        {autoCount > 0 && !progress && <p className="text-xs text-muted-foreground">다시 찾으면 자동으로 찾은 목록만 바뀌고, 직접 그린 영역은 유지됩니다.</p>}
        <label className="flex items-center justify-between gap-2 text-sm">
          미리보기에 모자이크 적용해서 보기
          <Switch checked={previewMosaic} onCheckedChange={useUiStore.getState().setPreviewMosaic} aria-label="미리보기에 모자이크 적용" />
        </label>
      </Section>

      <PersonList />
      <MosaicControls />

      <Section title="직접 가리기" description="자동으로 못 찾은 얼굴, 명찰, 차량 번호판 등은 미리보기 위에 네모를 그려 가립니다.">
        <Button variant={drawing ? 'secondary' : 'default'} onClick={() => useUiStore.getState().setDrawMosaic(!drawing)}>
          <Square /> {drawing ? '그리기 취소' : '미리보기에 네모 그리기'}
        </Button>
      </Section>
    </>
  );
}
