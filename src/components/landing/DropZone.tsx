'use client';

import { Film, Sparkles, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import type { PipelineStage, SourceTool } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { ACCEPT_VIDEO, createProjectFromFile, type ImportProgress } from '@/lib/editor/importPipeline';
import { settings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export const SAMPLE_URL = '/sample/editon-sample.mp4';

interface Props {
  /** 다 불러온 뒤 갈 곳. `:id` 자리에 새 프로젝트 id가 들어간다 (서버 컴포넌트에서도 넘길 수 있게 문자열) */
  to?: string;
  sourceTool?: SourceTool;
  pipelineStage?: PipelineStage;
  hint?: string;
  /** 샘플 영상 체험 버튼 (처음 화면에서만) */
  showSample?: boolean;
}

export function DropZone({ to = '/editor/:id', sourceTool, pipelineStage, hint, showSample = true }: Props = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const start = async (file: File) => {
    if (progress) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ stage: 'check', ratio: 0, label: '준비 중' });
    try {
      const { projectId, warnings } = await createProjectFromFile(file, setProgress, ctrl.signal, { sourceTool, pipelineStage });
      warnings.forEach((w) => useUiStore.getState().toast({ kind: 'info', title: w }));
      router.push(to.replace(':id', projectId));
    } catch (e) {
      useUiStore.getState().showError(e);
      setProgress(null);
    }
  };

  const trySample = async () => {
    try {
      setProgress({ stage: 'check', ratio: 0, label: '샘플 영상 받는 중' });
      const blob = await (await fetch(SAMPLE_URL)).blob();
      settings.setOnboarded(true);
      setProgress(null);
      await start(new File([blob], '편집ON 샘플.mp4', { type: 'video/mp4' }));
    } catch (e) {
      useUiStore.getState().showError(e);
      setProgress(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void start(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors sm:p-12',
        dragging ? 'border-primary bg-primary/10' : 'border-border bg-card/40',
      )}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_VIDEO} className="hidden" aria-hidden tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void start(f); e.target.value = ''; }} />
      {progress ? (
        <div className="w-full max-w-md space-y-3" aria-live="polite">
          <Film className="mx-auto h-10 w-10 animate-pulse text-primary" />
          <p className="font-medium">{progress.label}</p>
          <Progress value={Math.round(progress.ratio * 100)} aria-label="불러오기 진행률" />
          <Button variant="ghost" size="sm" onClick={() => { abortRef.current?.abort(); setProgress(null); }}>취소</Button>
        </div>
      ) : (
        <>
          <Upload className="h-12 w-12 text-primary" aria-hidden />
          <Button size="xl" onClick={() => inputRef.current?.click()}>영상 올리기</Button>
          <p className="text-sm text-muted-foreground">{hint ?? '또는 영상 파일을 여기에 끌어다 놓으세요 · MP4·MOV·WebM · 20분 이하 권장'}</p>
          {showSample && (
            <Button variant="link" onClick={() => void trySample()}>
              <Sparkles /> 영상이 없나요? 샘플 영상으로 30초 체험
            </Button>
          )}
        </>
      )}
    </div>
  );
}
