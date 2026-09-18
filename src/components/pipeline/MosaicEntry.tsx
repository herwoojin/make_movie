'use client';

// /mosaic — 얼굴 가리기로 바로 들어가는 입구. 편집기를 모자이크 패널이 열린 채로 연다.
import { EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DropZone } from '@/components/landing/DropZone';
import { formatDuration } from '@/lib/core/timecode';
import { listProjectRows, type ProjectRow } from '@/lib/storage/projectRepo';
import { formatRelative } from '@/lib/utils';

export function MosaicEntry() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  useEffect(() => {
    listProjectRows().then((r) => setRows(r.slice(0, 6))).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <EyeOff className="h-3.5 w-3.5" /> 얼굴 가리기
        </p>
        <h1 className="text-2xl font-bold">영상 얼굴 모자이크</h1>
        <p className="text-sm text-muted-foreground">
          영상 속 얼굴을 자동으로 찾아 따라다니며 가립니다. 본인은 “가리지 않기”로 빼고, 놓친 곳은 직접 네모를 그리면 됩니다.
        </p>
      </header>

      <DropZone to="/editor/:id?panel=mosaic" sourceTool="mosaic" pipelineStage={2} showSample={false}
        hint="또는 영상 파일을 여기에 끌어다 놓으세요 · 영상은 이 컴퓨터 밖으로 나가지 않습니다" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">열려 있는 영상에 적용하기</h2>
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">아직 프로젝트가 없습니다. 위에 영상을 올려 시작하세요.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows?.map(({ project }) => (
            <li key={project.id}>
              <Link href={`/editor/${project.id}?panel=mosaic`} className="block rounded-xl border bg-card p-3 transition-colors hover:border-primary">
                <p className="truncate font-medium">{project.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">결과 {formatDuration(project.durationMs)} · {formatRelative(project.updatedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">사진 여러 장을 한 번에 가리려면 <Link href="/tools/photo-mosaic" className="text-primary hover:underline">사진 얼굴 가리기</Link>를 쓰세요.</p>
    </div>
  );
}
