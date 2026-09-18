'use client';

// 2단계 진입 경로 ③ — 외부 영상 + SRT로 바로 시작 (PRD-v2 F-02-3)
import { FileVideo, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/misc';
import { ACCEPT_VIDEO, type ImportProgress } from '@/lib/editor/importPipeline';
import { createProjectFromVideoAndSrt } from '@/lib/editor/openWithSrt';
import { useUiStore } from '@/store/uiStore';

export function OpenWithSrtButton({ size = 'sm', variant = 'secondary' }: { size?: 'sm' | 'default'; variant?: 'secondary' | 'outline' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [subtitle, setSubtitle] = useState<File | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    if (!video || !subtitle) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ stage: 'check', ratio: 0, label: '준비 중' });
    try {
      const { projectId, clipCount } = await createProjectFromVideoAndSrt(video, subtitle, setProgress, ctrl.signal);
      useUiStore.getState().toast({
        kind: 'success',
        title: `자막 클립 ${clipCount}개로 시작합니다.`,
        hint: '이 자막에는 단어별 시간이 없어 칩의 시간은 글자 수로 어림잡았습니다. 칩을 지울 때 앞뒤가 조금 어긋날 수 있습니다.',
      });
      router.push(`/editor/${projectId}`);
    } catch (e) {
      useUiStore.getState().showError(e);
      setProgress(null);
    }
  };

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}><FileVideo /> 영상 + SRT 열기</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !progress) { setOpen(false); setVideo(null); setSubtitle(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>영상과 자막 파일로 시작하기</DialogTitle>
            <DialogDescription>
              1단계를 건너뛰고, 이미 있는 영상과 자막(SRT·VTT)으로 2단계 편집을 시작합니다. 파일은 이 컴퓨터 안에서만 처리됩니다.
            </DialogDescription>
          </DialogHeader>

          {progress ? (
            <div className="space-y-2" aria-live="polite">
              <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {progress.label}</p>
              <Progress value={Math.round(progress.ratio * 100)} aria-label="불러오기 진행률" />
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">영상 파일</span>
                <input type="file" accept={ACCEPT_VIDEO} className="block w-full text-xs" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">자막 파일 (.srt · .vtt)</span>
                <input type="file" accept=".srt,.vtt,text/vtt" className="block w-full text-xs" onChange={(e) => setSubtitle(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}

          <DialogFooter>
            {progress ? (
              <Button variant="ghost" onClick={() => { abortRef.current?.abort(); setProgress(null); }}>취소</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>닫기</Button>
                <Button disabled={!video || !subtitle} onClick={() => void start()}>시작하기</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
