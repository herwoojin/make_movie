'use client';

import { Circle, Download, Loader2, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import { formatTimecode } from '@/lib/core/timecode';
import { AppError } from '@/lib/errors';
import { videoToGif } from '@/lib/tools/videoFrames';
import { downloadBlob, formatBytes } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { useSendToEditor } from './useSendToEditor';

function pickMime(): { mime: string; ext: 'mp4' | 'webm' } {
  const candidates: [string, 'mp4' | 'webm'][] = [['video/mp4;codecs=avc1', 'mp4'], ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm', 'webm']];
  for (const [mime, ext] of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return { mime: '', ext: 'webm' };
}

export function ScreenRecorderTool() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; ext: 'mp4' | 'webm'; url: string } | null>(null);
  const [gifRatio, setGifRatio] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const { send, busy } = useSendToEditor();

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new AppError('UNSUPPORTED_BROWSER', '이 브라우저는 화면 녹화를 지원하지 않습니다.', '데스크톱 Chrome 또는 Edge를 써 주세요.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      const { mime, ext } = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime || 'video/webm' });
        setResult({ blob, ext, url: URL.createObjectURL(blob) });
        setRecording(false);
      };
      // 사용자가 브라우저의 "공유 중지"를 눌러도 녹화가 정상 종료되게
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (recorder.state !== 'inactive') recorder.stop(); });
      recorder.start(1000);
      recorderRef.current = recorder;
      setResult(null);
      setRecording(true);
    } catch (e) {
      if ((e as { name?: string }).name !== 'NotAllowedError') useUiStore.getState().showError(e);
    }
  };

  const toGif = async () => {
    if (!result) return;
    setGifRatio(0);
    try {
      const gif = await videoToGif(result.blob, { width: 640, fps: 10, startMs: 0, maxDurationMs: 30_000, maxBytes: 0 }, setGifRatio);
      downloadBlob(gif, '화면녹화.gif');
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setGifRatio(null);
    }
  };

  return (
    <Section title="화면 녹화" description="화면·창·탭을 녹화해서 영상이나 GIF로 저장합니다. 녹화 파일은 이 컴퓨터에만 남습니다.">
      {recording ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-lg tabular-nums text-red-400"><Circle className="h-4 w-4 animate-pulse fill-red-500" /> {formatTimecode(elapsed)}</span>
          <Button variant="destructive" onClick={() => recorderRef.current?.stop()}><Square /> 녹화 끝내기</Button>
        </div>
      ) : (
        <Button size="lg" onClick={() => void start()}><Circle className="fill-red-500 text-red-500" /> 녹화 시작</Button>
      )}
      {result && (
        <div className="space-y-2">
          <video src={result.url} controls className="max-h-80 w-full rounded bg-black" aria-label="녹화 결과" />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadBlob(result.blob, `화면녹화.${result.ext}`)}><Download /> 영상 저장 ({result.ext.toUpperCase()}, {formatBytes(result.blob.size)})</Button>
            <Button variant="secondary" disabled={gifRatio !== null} onClick={() => void toGif()}>
              {gifRatio !== null ? <Loader2 className="animate-spin" /> : <Download />} GIF로 저장 (앞 30초)
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void send(new File([result.blob], `화면녹화.${result.ext}`, { type: result.blob.type }))}>편집기로 보내기</Button>
          </div>
          {gifRatio !== null && <Progress value={gifRatio * 100} aria-label="GIF 변환 진행률" />}
        </div>
      )}
    </Section>
  );
}
