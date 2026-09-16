'use client';

import { Download, Film, Loader2, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { Badge, Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { formatDuration } from '@/lib/core/timecode';
import { toAppError } from '@/lib/errors';
import { videoToGif } from '@/lib/tools/videoFrames';
import { baseName, downloadBlob, formatBytes } from '@/lib/utils';
import { useSendToEditor } from './useSendToEditor';

interface Item { id: string; file: File; status: 'wait' | 'run' | 'done' | 'fail'; ratio: number; result?: Blob; error?: string }

export function GifBatchTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [width, setWidth] = useState(480);
  const [fps, setFps] = useState(10);
  const [startSec, setStartSec] = useState(0);
  const [maxSec, setMaxSec] = useState(10);
  const [maxMb, setMaxMb] = useState(0);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { send, busy } = useSendToEditor();

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const runAll = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    for (const item of items.filter((x) => x.status === 'wait' || x.status === 'fail')) {
      if (ctrl.signal.aborted) break;
      patch(item.id, { status: 'run', ratio: 0, error: undefined });
      try {
        const result = await videoToGif(item.file, { width, fps, startMs: startSec * 1000, maxDurationMs: maxSec * 1000, maxBytes: maxMb * 1024 * 1024 }, (ratio) => patch(item.id, { ratio }), ctrl.signal);
        patch(item.id, { status: 'done', ratio: 1, result });
      } catch (e) {
        const err = toAppError(e);
        patch(item.id, { status: err.code === 'ABORTED' ? 'wait' : 'fail', error: `${err.message} ${err.hint}` });
      }
    }
    setRunning(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Section title="설정" description="모든 파일에 같은 설정이 적용됩니다.">
        <Segmented label="가로 크기" value={width} options={[[320, '320'], [480, '480'], [640, '640'], [800, '800']]} onChange={setWidth} />
        <Segmented label="초당 장수 (부드러움)" value={fps} options={[[5, '5장'], [10, '10장'], [15, '15장']]} onChange={setFps} />
        <SliderField label="시작 시점" value={startSec} min={0} max={120} format={(v) => `${v}초`} onChange={setStartSec} />
        <SliderField label="최대 길이" value={maxSec} min={1} max={30} format={(v) => `${v}초`} hint="GIF는 길수록 용량이 급격히 커집니다." onChange={setMaxSec} />
        <SliderField label="용량 상한" value={maxMb} min={0} max={20} format={(v) => (v ? `${v}MB` : '제한 없음')} hint="넘으면 크기를 줄여 다시 만듭니다 (카톡·슬랙 올리기용)." onChange={setMaxMb} />
      </Section>
      <Section title="파일" actions={
        running ? <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>멈추기</Button>
          : <Button size="sm" disabled={!items.some((x) => x.status === 'wait' || x.status === 'fail')} onClick={() => void runAll()}><Wand2 /> 모두 GIF로 변환</Button>
      }>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground hover:border-primary">
          <Film className="h-8 w-8" /> 영상 여러 개 선택 (MP4·WebM·MOV)
          <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            setItems((list) => [...list, ...files.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, status: 'wait' as const, ratio: 0 }))]);
            e.target.value = '';
          }} />
        </label>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-1.5 rounded-md border p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                {item.status === 'wait' && <Badge tone="muted">대기</Badge>}
                {item.status === 'run' && <Loader2 className="h-4 w-4 animate-spin" />}
                {item.status === 'done' && item.result && <Badge tone="success">{formatBytes(item.result.size)}</Badge>}
                {item.status === 'fail' && <Badge tone="danger">실패</Badge>}
              </div>
              {item.status === 'run' && <Progress value={item.ratio * 100} className="h-1.5" aria-label={`${item.file.name} 변환 진행률`} />}
              {item.error && <p className="text-xs text-red-400">{item.error}</p>}
              <div className="flex gap-1">
                {item.result && <Button size="sm" variant="secondary" onClick={() => downloadBlob(item.result!, `${baseName(item.file.name)}.gif`)}><Download /> GIF 받기</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send(item.file)}>편집기로 보내기</Button>
              </div>
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="text-xs text-muted-foreground">선택한 영상은 이 컴퓨터 안에서만 변환됩니다. 예: {formatDuration(maxSec * 1000)} × {fps}장 = {maxSec * fps}장</p>}
      </Section>
    </div>
  );
}
