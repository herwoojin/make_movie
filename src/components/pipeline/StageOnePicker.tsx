'use client';

// 2단계 진입 경로 ① — 1단계에서 자동편집한 프로젝트를 그대로 이어받는다.
// 파일을 다시 인코딩하지 않는다: 같은 원본·EDL·단어를 그대로 열 뿐이다.
import { Import } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDuration } from '@/lib/core/timecode';
import { listProjectRows, setPipelineStage, type ProjectRow } from '@/lib/storage/projectRepo';
import { formatRelative } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function StageOnePicker({ size = 'sm', variant = 'secondary' }: { size?: 'sm' | 'default'; variant?: 'secondary' | 'outline' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProjectRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    listProjectRows().then(setRows).catch((e) => { useUiStore.getState().showError(e); setRows([]); });
  }, [open]);

  const openProject = async (projectId: string) => {
    await setPipelineStage(projectId, 2);
    router.push(`/editor/${projectId}`);
  };

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}><Import /> 1단계 결과 가져오기</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이어서 편집할 프로젝트</DialogTitle>
            <DialogDescription>1단계에서 자동편집한 결과를 그대로 가져옵니다. 영상을 다시 만들지 않아 바로 열립니다.</DialogDescription>
          </DialogHeader>
          {rows === null && <p className="py-6 text-center text-sm text-muted-foreground" role="status">불러오는 중…</p>}
          {rows?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">아직 프로젝트가 없습니다. 1단계에서 영상을 먼저 올려 주세요.</p>}
          {rows && rows.length > 0 && (
            <ul className="scrollbar-thin max-h-80 space-y-1.5 overflow-y-auto">
              {rows.map(({ project, clipCount }) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => void openProject(project.id)}
                    className="w-full rounded-lg border p-2.5 text-left transition-colors hover:border-primary"
                  >
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {project.pipelineStage === 1 ? '1단계 자동편집' : '2단계 편집 중'} · 결과 {formatDuration(project.durationMs)}
                      {clipCount > 0 && ` · ${clipCount}개 자막 클립`} · {formatRelative(project.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
