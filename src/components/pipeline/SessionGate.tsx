'use client';

// 프로젝트를 여는 동안·실패했을 때 보여 줄 공통 화면.
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { AppErrorShape } from '@/lib/errors';

export function SessionGate({ status, error, children }: { status: string; error: AppErrorShape | null; children: ReactNode }) {
  if (status === 'error' && error) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-10 text-center">
        <p className="text-lg font-semibold">{error.message}</p>
        <p className="text-sm text-muted-foreground">👉 {error.hint}</p>
        <Button asChild><Link href="/projects">프로젝트 목록으로</Link></Button>
      </div>
    );
  }
  if (status !== 'ready') {
    return (
      <div className="flex h-[calc(100vh-4.75rem)] items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> 프로젝트를 여는 중…
      </div>
    );
  }
  return <>{children}</>;
}
