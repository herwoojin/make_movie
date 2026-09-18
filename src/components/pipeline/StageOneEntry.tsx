'use client';

// /auto-edit — 프로젝트를 고르지 않았을 때: 영상을 올리거나, 하던 것을 이어서 연다.
import { Scissors } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DropZone } from '@/components/landing/DropZone';
import { formatDuration } from '@/lib/core/timecode';
import { listProjectRows, type ProjectRow } from '@/lib/storage/projectRepo';
import { formatRelative } from '@/lib/utils';

export function StageOneEntry() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  useEffect(() => {
    listProjectRows().then((r) => setRows(r.slice(0, 6))).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Scissors className="h-3.5 w-3.5" /> 1단계
        </p>
        <h1 className="text-2xl font-bold">음성 자동편집</h1>
        <p className="text-sm text-muted-foreground">
          말이 없는 구간과 “어… 음…” 같은 추임새를 찾아 잘라 냅니다. 여기까지만 쓰고 자동편집된 영상을 저장해도 되고, 2단계에서 자막까지 붙여도 됩니다.
        </p>
      </header>

      <DropZone to="/auto-edit?project=:id" sourceTool="auto-edit" pipelineStage={1} showSample={false}
        hint="또는 영상 파일을 여기에 끌어다 놓으세요 · MP4·MOV·WebM · 20분 이하 권장" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">이어서 하기</h2>
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">아직 프로젝트가 없습니다. 위에 영상을 올려 시작하세요.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows?.map(({ project }) => (
            <li key={project.id}>
              <Link href={`/auto-edit?project=${project.id}`} className="block rounded-xl border bg-card p-3 transition-colors hover:border-primary">
                <p className="truncate font-medium">{project.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  결과 {formatDuration(project.durationMs)} · {formatRelative(project.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
