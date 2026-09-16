'use client';

import { Download, Loader2, Music } from 'lucide-react';
import { useRef, useState } from 'react';
import type { EdlSegment } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { formatShort, parseTimecode } from '@/lib/core/timecode';
import { exportWavRanges } from '@/lib/encode/audioOnly';
import { AppError } from '@/lib/errors';
import { openVideo } from '@/lib/tools/videoFrames';
import { baseName, downloadBlob } from '@/lib/utils';
import { progressRatio, type Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useUiStore } from '@/store/uiStore';

export function AudioExtractTool() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState('0:00.0');
  const [end, setEnd] = useState('0:00.0');
  const [format, setFormat] = useState<'wav' | 'mp3'>('wav');
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const choose = async (f: File) => {
    try {
      const { durationMs, close } = await openVideo(f);
      close();
      setFile(f);
      setDuration(durationMs);
      setStart('0:00.0');
      setEnd(formatShort(durationMs));
    } catch (e) {
      useUiStore.getState().showError(e);
    }
  };

  const run = async () => {
    if (!file) return;
    const s = parseTimecode(start);
    const e = parseTimecode(end);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (s === null || e === null || e <= s) throw new AppError('UNKNOWN', '구간을 이해하지 못했습니다.', '시작과 끝을 "1:05.5"처럼 적고, 끝이 시작보다 뒤에 오게 해 주세요.');
      const range = { startMs: s, endMs: Math.min(e, duration || e) };
      setProgress({ phase: 'decode', done: 0, total: 1 });
      let blob: Blob;
      if (format === 'wav') {
        blob = await exportWavRanges(file, [range], setProgress, ctrl.signal);
      } else {
        const { renderWithFfmpeg } = await import('@/lib/encode/ffmpeg');
        const seg: EdlSegment = { id: 'range', projectId: 'tool', assetId: 'tool', order: 0, sourceStartMs: range.startMs, sourceEndMs: range.endMs, enabled: true, origin: 'initial', updatedAt: 0 };
        blob = await renderWithFfmpeg({
          edl: [seg], mosaicHoldMs: 0, sourceWidth: 0, sourceHeight: 0, sourceFps: 30, hasAudio: true,
          output: { width: 0, height: 0, fps: 30, bitrate: 0, format: 'mp3', fit: 'contain' },
        }, file, setProgress, ctrl.signal);
      }
      downloadBlob(blob, `${baseName(file.name)}.${format}`);
    } catch (err) {
      useUiStore.getState().showError(err);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Section title="오디오 추출" description="영상에서 소리만 뽑아 WAV(원음) 또는 MP3(작은 용량)로 저장합니다.">
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:border-primary">
        <Music className="h-5 w-5" /> {file ? `${file.name} (${formatShort(duration)})` : '영상 또는 오디오 파일 선택'}
        <input type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); }} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label htmlFor="ae-start" className="text-xs">시작 (분:초)</Label><Input id="ae-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ae-end" className="text-xs">끝 (분:초)</Label><Input id="ae-end" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <Segmented label="형식" value={format} options={[['wav', 'WAV (빠름·원음)'], ['mp3', 'MP3 (작은 용량, 예비 인코더 사용)']]} onChange={setFormat} />
      {progress ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> 추출 중</p>
          <Progress value={progressRatio(progress) * 100} aria-label="오디오 추출 진행률" />
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>취소</Button>
        </div>
      ) : (
        <Button disabled={!file} onClick={() => void run()}><Download /> 추출해서 저장</Button>
      )}
    </Section>
  );
}
