'use client';

// 클립 목록 위 도구 모음. 되돌리기·선택 삭제처럼 "방금 한 일"을 다루는 버튼만 둔다.
import { Download, ListChecks, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/misc';
import { UndoRedo } from '../UndoRedo';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';

export function ClipToolbar() {
  const clipCount = useProjectStore((s) => s.doc.clips.length);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const autoFollow = useUiStore((s) => s.autoFollow);
  const showDeleted = useUiStore((s) => s.showDeletedWords);
  const timelineOpen = useUiStore((s) => s.timelineOpen);
  const [confirming, setConfirming] = useState(false);

  const removeSelected = () => {
    useProjectStore.getState().removeClips(selectedIds);
    useTimelineStore.getState().setSelectedClips([]);
    setConfirming(false);
    useUiStore.getState().toast({ kind: 'success', title: `클립 ${selectedIds.length}개를 뺐습니다.`, hint: '되돌리기(Ctrl+Z)로 되살릴 수 있습니다.' });
  };

  const selectAll = () => {
    const all = useProjectStore.getState().doc.clips.map((c) => c.id);
    useTimelineStore.getState().setSelectedClips(selectedIds.length === all.length ? [] : all);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <UndoRedo labeled />
      <Button size="sm" variant="ghost" onClick={selectAll} title="모두 선택/해제"><ListChecks /> 모두 선택</Button>
      <Button size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => setConfirming(true)}>
        <Trash2 /> 선택 삭제{selectedIds.length > 0 && ` (${selectedIds.length})`}
      </Button>

      <span className="text-xs text-muted-foreground">{clipCount}개 자막 클립</span>
      <span className="flex-1" />

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        지운 단어 보기
        <Switch checked={showDeleted} onCheckedChange={useUiStore.getState().setShowDeletedWords} aria-label="지운 단어 보기" />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        자동 따라가기
        <Switch checked={autoFollow} onCheckedChange={useUiStore.getState().setAutoFollow} aria-label="자동 따라가기" />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        타임라인
        <Switch checked={timelineOpen} onCheckedChange={useUiStore.getState().setTimelineOpen} aria-label="타임라인 보기" />
      </label>
      <Button size="sm" onClick={() => useUiStore.getState().setPanel('export')}><Download /> 완성 영상 내보내기</Button>

      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>선택한 클립 {selectedIds.length}개를 뺄까요?</DialogTitle>
            <DialogDescription>그 구간은 완성 영상에서 빠집니다. 원본 파일은 그대로이고, 되돌리기로 되살릴 수 있습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>취소</Button>
            <Button variant="destructive" onClick={removeSelected}>빼기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
