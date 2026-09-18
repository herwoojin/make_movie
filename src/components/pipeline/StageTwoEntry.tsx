'use client';

// /editor (프로젝트 없이 들어왔을 때) — 2단계로 들어가는 세 갈래 길을 보여 준다.
import { Subtitles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/core/timecode';
import { listProjectRows, type ProjectRow } from '@/lib/storage/projectRepo';
import { formatRelative } from '@/lib/utils';
import { OpenWithSrtButton } from './OpenWithSrtButton';
import { StageOnePicker } from './StageOnePicker';

export function StageTwoEntry() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  useEffect(() => {
    listProjectRows().then((r) => setRows(r.slice(0, 6))).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Subtitles className="h-3.5 w-3.5" /> 2단계
        </p>
        <h1 className="text-2xl font-bold">자막·영상 편집</h1>
        <p className="text-sm text-muted-foreground">
          단어 칩을 지워 영상을 다듬고, 자막 서식·배속·화면 비율을 정해 완성 영상을 내보냅니다.
        </p>
      </header>

      <section className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
        <StageOnePicker size="default" />
        <OpenWithSrtButton size="default" variant="outline" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">최근 편집</h2>
        {rows === null && <p className="text-sm text-muted-foreground" role="status">불러오는 중…</p>}
        {rows?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            아직 프로젝트가 없습니다. <Link href="/auto-edit" className="text-primary hover:underline">1단계 음성 자동편집</Link>부터 시작해 보세요.
          </p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows?.map(({ project, clipCount }) => (
            <li key={project.id}>
              <Link href={`/editor/${project.id}`} className="block rounded-xl border bg-card p-3 transition-colors hover:border-primary">
                <p className="truncate font-medium">{project.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {clipCount}개 자막 클립 · 결과 {formatDuration(project.durationMs)} · {formatRelative(project.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
