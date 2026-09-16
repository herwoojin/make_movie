'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label, Progress } from '@/components/ui/misc';
import type { ImportProgress } from '@/lib/editor/importPipeline';
import { importEditonProject } from '@/lib/editor/projectFile';
import { parseProjectFile, type EditonProjectFile } from '@/lib/storage/projectRepo';
import { formatBytes } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function ImportProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [json, setJson] = useState<EditonProjectFile | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const readJson = async (file: File) => {
    try {
      setJson(parseProjectFile(JSON.parse(await file.text())));
    } catch (e) {
      useUiStore.getState().showError(e);
    }
  };

  const readVideo = async (video: File) => {
    if (!json) return;
    try {
      const id = await importEditonProject(json, video, setProgress);
      onOpenChange(false);
      router.push(`/editor/${id}`);
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setJson(null); setProgress(null); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>프로젝트 파일 불러오기</DialogTitle>
          <DialogDescription>프로젝트 파일에는 편집 결정만 들어 있습니다. 원본 영상도 함께 선택해 주세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editon-json">1단계: .editon.json 파일</Label>
            <input id="editon-json" type="file" accept=".json,application/json" className="block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readJson(f); }} />
            {json && <p className="text-xs text-emerald-400">✅ &quot;{json.project.name}&quot; — 원본: {json.assets[0].fileName} ({formatBytes(json.assets[0].fileSize)})</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editon-video">2단계: 원본 영상 다시 선택</Label>
            <input id="editon-video" type="file" accept="video/*" disabled={!json || !!progress} className="block w-full text-sm disabled:opacity-50" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readVideo(f); }} />
          </div>
          {progress && (
            <div className="space-y-1">
              <p className="text-sm">{progress.label}</p>
              <Progress value={Math.round(progress.ratio * 100)} aria-label="불러오기 진행률" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
