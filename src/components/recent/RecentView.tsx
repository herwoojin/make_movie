'use client';

// 최근 저장 결과 (F-11). 도구가 여러 개라 "방금 만든 그 파일"을 여기서 다시 찾는다.
import { Download, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedResult, SavedResultKind } from '@/types/models';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/core/timecode';
import { clearOlderThan, deleteSavedResult, getSavedBlob, KEEP_LIMIT, listSavedResults } from '@/lib/storage/savedResults';
import { openSavedFolder } from '@/lib/storage/saveTarget';
import { cn, downloadBlob, formatBytes, formatRelative } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

const KIND_LABEL: Record<SavedResultKind, string> = {
  video: '영상', gif: 'GIF', audio: '소리', subtitle: '자막', image: '이미지', document: '문서',
};

const TOOL_LABEL: Record<string, string> = {
  'auto-edit': '음성 자동편집', translate: '해외 영상 번역', dub: '소리 입히기', tts: '내 목소리 TTS',
  mosaic: '얼굴 모자이크', compress: '용량 줄이기', gif: 'GIF 변환', 'screen-gif': '화면녹화 GIF', import: '불러오기',
};

export function RecentView() {
  const [rows, setRows] = useState<SavedResult[] | null>(null);
  const [kind, setKind] = useState<SavedResultKind | 'all'>('all');
  const [tool, setTool] = useState<string>('all');

  const refresh = useCallback(() => {
    listSavedResults().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(refresh, [refresh]);

  const tools = useMemo(() => [...new Set((rows ?? []).map((r) => r.toolId))], [rows]);
  const shown = (rows ?? []).filter((r) => (kind === 'all' || r.kind === kind) && (tool === 'all' || r.toolId === tool));

  const download = async (row: SavedResult) => {
    const file = await getSavedBlob(row);
    if (!file) {
      useUiStore.getState().toast({ kind: 'error', title: '이 결과의 사본이 남아 있지 않습니다.', hint: '저장했던 폴더에서 파일을 찾아 주세요.' });
      return;
    }
    downloadBlob(file, row.fileName);
  };

  const remove = async (row: SavedResult) => {
    await deleteSavedResult(row.id);
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">최근 저장 결과</h1>
        <p className="text-sm text-muted-foreground">
          내보낸 파일 목록입니다. 사본은 이 브라우저 안에 보관되며, 원본 영상과 마찬가지로 인터넷으로 나가지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div role="radiogroup" aria-label="종류 고르기" className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          {(['all', 'video', 'gif', 'audio', 'subtitle', 'image', 'document'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn('rounded px-2 py-1 text-xs', kind === k ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')}>
              {k === 'all' ? '전체' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {tools.length > 1 && (
          <div role="radiogroup" aria-label="만든 도구 고르기" className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
            <button type="button" role="radio" aria-checked={tool === 'all'} onClick={() => setTool('all')}
              className={cn('rounded px-2 py-1 text-xs', tool === 'all' ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')}>모든 도구</button>
            {tools.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tool === t} onClick={() => setTool(t)}
                className={cn('rounded px-2 py-1 text-xs', tool === t ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')}>
                {TOOL_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows && rows.length > KEEP_LIMIT && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>{rows.length}건이 쌓였습니다. 오래된 사본이 저장공간을 차지합니다.</span>
          <Button size="sm" variant="secondary" onClick={() => void clearOlderThan().then(refresh)}>오래된 것 {rows.length - KEEP_LIMIT}건 정리</Button>
        </div>
      )}

      {rows === null && <p className="text-sm text-muted-foreground" role="status">불러오는 중…</p>}
      {rows?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          아직 저장한 결과가 없습니다. <Link href="/auto-edit" className="text-primary hover:underline">1단계 음성 자동편집</Link>부터 시작해 보세요.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">{KIND_LABEL[row.kind]}</span>
              <span className="truncate text-xs text-muted-foreground">{TOOL_LABEL[row.toolId] ?? row.toolId}</span>
            </div>
            <p className="truncate font-medium" title={row.fileName}>{row.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(row.fileSize)}
              {row.durationMs ? ` · ${formatDuration(row.durationMs)}` : ''} · {formatRelative(row.createdAt)}
            </p>
            {row.localPath && <p className="truncate text-[11px] text-muted-foreground" title={row.localPath}>{row.localPath}</p>}
            <div className="mt-auto flex flex-wrap gap-1.5">
              {row.projectId && (
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/editor/${row.projectId}`}><Pencil /> 다시 편집</Link>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void download(row)}><Download /> 다시 받기</Button>
              {row.localPath && (
                <Button size="sm" variant="ghost" onClick={() => void openSavedFolder(row.localPath)}><FolderOpen /> 폴더 열기</Button>
              )}
              <Button size="sm" variant="ghost" aria-label={`${row.fileName} 삭제`} onClick={() => void remove(row)}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
