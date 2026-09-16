'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import { formatDuration } from '@/lib/core/timecode';
import type { UsedEncoder } from '@/lib/encode';
import { estimateEta, progressRatio, type Progress as WorkerProgress } from '@/lib/worker/protocol';

const PHASE: Record<string, string> = {
  decode: '소리 준비 중',
  analyze: '준비 중',
  render: '영상 만드는 중',
  mux: '파일로 묶는 중',
  write: '저장 중',
};

const ENCODER: Record<UsedEncoder, string> = {
  webcodecs: '빠른 인코더 (그래픽카드)',
  'ffmpeg-wasm': '예비 인코더 (ffmpeg)',
  native: '브라우저 기본',
};

export function ExportProgressView({ run, onCancel }: { run: { progress: WorkerProgress | null; startedAt: number; encoder: UsedEncoder | null }; onCancel: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ratio = progressRatio(run.progress);
  const eta = estimateEta(run.startedAt, ratio);

  return (
    <Section title="내보내는 중" description="다른 탭을 봐도 계속됩니다. 이 창은 닫지 마세요.">
      <div className="space-y-3" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {run.progress?.message ?? PHASE[run.progress?.phase ?? 'analyze'] ?? '처리 중'}
        </p>
        <Progress value={ratio * 100} aria-label="내보내기 진행률" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{Math.round(ratio * 100)}%</span>
          <span>경과 {formatDuration(Date.now() - run.startedAt)}{eta !== undefined && ` · 남은 시간 약 ${formatDuration(eta)}`}</span>
        </div>
        {run.encoder && <p className="text-xs text-muted-foreground">사용 중: {ENCODER[run.encoder]}</p>}
        <Button variant="destructive" onClick={onCancel}><X /> 취소</Button>
      </div>
    </Section>
  );
}
