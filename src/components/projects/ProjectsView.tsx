'use client';

import { Download, FileUp, FolderOpen, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, Card } from '@/components/ui/misc';
import { formatDuration } from '@/lib/core/timecode';
import { buildProjectFile, deleteProject, listProjects } from '@/lib/storage/projectRepo';
import { downloadBlob, formatRelative } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { ImportProjectDialog } from './ImportProjectDialog';

const STATUS: Record<Project['status'], string> = { draft: '새 프로젝트', editing: '편집 중', exporting: '내보내는 중', done: '완료' };

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(() => {
    listProjects().then(setProjects).catch((e) => { useUiStore.getState().showError(e); setProjects([]); });
  }, []);
  useEffect(refresh, [refresh]);

  const exportFile = async (p: Project) => {
    try {
      const json = await buildProjectFile(p.id);
      downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `${p.name}.editon.json`);
    } catch (e) {
      useUiStore.getState().showError(e);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    try {
      await deleteProject(confirm.id);
      useUiStore.getState().toast({ kind: 'success', title: `"${confirm.name}" 프로젝트를 지웠습니다.` });
    } catch (e) {
      useUiStore.getState().showError(e);
    }
    setConfirm(null);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">프로젝트</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp /> 프로젝트 파일 불러오기</Button>
          <Button asChild><Link href="/">새 영상 올리기</Link></Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">이 브라우저에 저장된 프로젝트입니다. 다른 컴퓨터로 옮기려면 프로젝트 파일(.editon.json)로 내보낸 뒤 원본 영상과 함께 불러오세요.</p>

      {projects === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Card key={i} className="h-32 animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <Card className="p-10 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">아직 프로젝트가 없습니다.</p>
          <Button asChild className="mt-4"><Link href="/">영상 올리기</Link></Button>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/editor/${p.id}`} className="min-w-0 font-semibold hover:text-primary">
                    <span className="block truncate">{p.name}</span>
                  </Link>
                  <Badge tone={p.status === 'done' ? 'success' : 'muted'}>{STATUS[p.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  원본 {formatDuration(p.sourceDurationMs)} → 결과 {formatDuration(p.durationMs)} · {p.width}×{p.height}
                </p>
                <p className="text-xs text-muted-foreground">마지막 수정 {formatRelative(p.updatedAt)}</p>
                <div className="mt-auto flex gap-1 pt-3">
                  <Button asChild size="sm"><Link href={`/editor/${p.id}`}>열기</Link></Button>
                  <Button size="sm" variant="ghost" onClick={() => void exportFile(p)} aria-label={`${p.name} 프로젝트 파일 내보내기`}><Download /> 파일로</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-red-400" onClick={() => setConfirm(p)} aria-label={`${p.name} 삭제`}><Trash2 /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트를 지울까요?</DialogTitle>
            <DialogDescription>
              &quot;{confirm?.name}&quot;의 편집 기록과 브라우저에 보관된 영상 사본이 지워집니다. 내 컴퓨터에 있는 원본 파일은 그대로입니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>취소</Button>
            <Button variant="destructive" onClick={() => void remove()}>지우기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportProjectDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
