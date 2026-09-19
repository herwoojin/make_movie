'use client';

import { Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Project } from '@/types/models';
import { formatDuration } from '@/lib/core/timecode';
import { listProjects } from '@/lib/storage/projectRepo';
import { formatRelative } from '@/lib/utils';
import { OwnerNotice } from '@/components/projects/OwnerNotice';

export function RecentProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    listProjects().then((p) => setProjects(p.slice(0, 3))).catch(() => setProjects([]));
  }, []);
  if (projects.length === 0) return <OwnerNotice />;
  return (
    <section aria-labelledby="recent-title" className="space-y-3">
      <OwnerNotice />
      <div className="flex items-center justify-between">
        <h2 id="recent-title" className="text-lg font-semibold">이어서 편집하기</h2>
        <Link href="/projects" className="text-sm text-primary hover:underline">전체 보기</Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/editor/${p.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary">
              <p className="truncate font-medium">{p.name}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {formatRelative(p.updatedAt)} · 결과 {formatDuration(p.durationMs)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
