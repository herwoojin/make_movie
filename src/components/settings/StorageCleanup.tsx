'use client';

import { HardDrive, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Badge, Progress } from '@/components/ui/misc';
import { cleanupOrphans, deleteProject, storageReport, type StorageRow } from '@/lib/storage/projectRepo';
import { getEstimate, usageRatio, type StorageEstimateLite } from '@/lib/storage/quota';
import { formatBytes, formatRelative } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function StorageCleanup() {
  const [rows, setRows] = useState<StorageRow[] | null>(null);
  const [est, setEst] = useState<StorageEstimateLite | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setEst(await getEstimate());
    setRows(await storageReport().catch(() => []));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Section
      title="저장공간 정리"
      description="영상 사본은 이 브라우저 전용 저장소에 있습니다. 30일 넘게 열지 않은 프로젝트는 표시만 하고, 자동으로 지우지는 않습니다."
      actions={<Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
        const n = await cleanupOrphans();
        useUiStore.getState().toast({ kind: 'success', title: n ? `남아 있던 파일 묶음 ${n}개를 정리했습니다.` : '정리할 찌꺼기 파일이 없습니다.' });
      })}>찌꺼기 파일 정리</Button>}
    >
      {est && est.quota > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" /> 사용 중 {formatBytes(est.usage)}</span>
            <span>브라우저가 허용한 공간 {formatBytes(est.quota)}</span>
          </div>
          <Progress value={Math.round(usageRatio(est) * 100)} aria-label="저장공간 사용률" />
        </div>
      )}
      {rows === null ? (
        <p className="text-sm text-muted-foreground">용량 계산 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">저장된 프로젝트가 없습니다.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => (
            <li key={r.project.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{r.project.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(r.bytes)} · {formatRelative(r.project.updatedAt)}</p>
              </div>
              {r.stale && <Badge tone="warning">30일 넘게 안 열었음</Badge>}
              <Button size="sm" variant="ghost" className="text-red-400" disabled={busy} aria-label={`${r.project.name} 삭제`}
                onClick={() => void run(() => deleteProject(r.project.id))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
