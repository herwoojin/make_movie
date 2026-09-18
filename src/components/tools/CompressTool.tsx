'use client';

// 영상 용량 줄이기 (F-10). 여러 개를 큐에 넣고 한 번에 처리한다.
import { Download, Play, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ElapsedTimer } from '@/components/common/ElapsedTimer';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label, Progress } from '@/components/ui/misc';
import { formatDuration } from '@/lib/core/timecode';
import { COMPRESS_PRESETS, planCompression, type CompressPlan } from '@/lib/encode/compress';
import { compressFile } from '@/lib/encode/runCompress';
import { ACCEPT_VIDEO } from '@/lib/editor/importPipeline';
import { probeMedia } from '@/lib/media/probeClient';
import { saveAndRecord } from '@/lib/storage/savedResults';
import { baseName, cn, downloadBlob, formatBytes } from '@/lib/utils';
import { progressRatio, type Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useUiStore } from '@/store/uiStore';
import { CompareView } from './CompareView';

interface Item {
  id: string;
  file: File;
  durationMs: number;
  width: number;
  height: number;
  plan: CompressPlan | null;
  state: 'ready' | 'working' | 'done' | 'failed';
  ratio: number;
  result?: Blob;
}

export function CompressTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [presetId, setPresetId] = useState('standard');
  const [targetMB, setTargetMB] = useState('20');
  const [running, setRunning] = useState<{ startedAt: number } | null>(null);
  const [compare, setCompare] = useState<Item | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const target = Number(targetMB) > 0 ? Number(targetMB) : undefined;

  const replan = (list: Item[], preset = presetId, mb = target): Item[] =>
    list.map((it) => ({
      ...it,
      plan: planCompression(
        { width: it.width, height: it.height, fps: 30, durationMs: it.durationMs, audioCodec: 'aac' },
        preset,
        mb,
      ),
    }));

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      try {
        const probe = await probeMedia(file);
        next.push({
          id: `${file.name}-${file.size}-${next.length}`, file, durationMs: probe.durationMs,
          width: probe.width, height: probe.height, plan: null, state: 'ready', ratio: 0,
        });
      } catch (e) {
        useUiStore.getState().showError(e);
      }
    }
    setItems((prev) => replan([...prev, ...next]));
  };

  const runAll = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setRunning({ startedAt });
    useUiStore.getState().setStatus({ kind: 'busy', text: '영상 용량을 줄이는 중…', startedAt });
    try {
      for (const item of items) {
        if (item.state === 'done' || ctrl.signal.aborted) continue;
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: 'working', ratio: 0 } : i)));
        try {
          const onProgress = (p: WorkerProgress) => {
            const r = progressRatio(p);
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ratio: r } : i)));
          };
          const res = await compressFile(item.file, { presetId, targetMB: target }, onProgress, ctrl.signal);
          const fileName = `${baseName(item.file.name)}_압축.mp4`;
          const { outcome } = await saveAndRecord({ blob: res.blob, fileName, kind: 'video', toolId: 'compress', durationMs: res.durationMs });
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: 'done', ratio: 1, result: res.blob, plan: res.plan } : i)));
          useUiStore.getState().setStatus({ kind: 'done', text: `저장 완료 · ${outcome.location}` });
        } catch (e) {
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, state: 'failed' } : i)));
          useUiStore.getState().showError(e);
        }
      }
    } finally {
      setRunning(null);
    }
  };

  const overall = items.length ? items.reduce((a, i) => a + (i.state === 'done' ? 1 : i.ratio), 0) / items.length : 0;

  return (
    <div className="space-y-4">
      <Section title="줄일 영상" description="여러 개를 한 번에 넣을 수 있습니다. 파일은 이 컴퓨터 안에서만 처리됩니다.">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Plus className="h-4 w-4" /> 영상 추가
          <input type="file" multiple accept={ACCEPT_VIDEO} className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        </label>
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(item.file.size)} · {formatDuration(item.durationMs)} · {item.width}×{item.height}
                  </span>
                  <span className="flex-1" />
                  {item.plan && item.state !== 'done' && (
                    item.plan.estimatedBytes >= item.file.size ? (
                      // 이미 잘 압축된 영상을 다시 압축하면 오히려 커진다 — 먼저 알려 준다
                      <span className="text-xs text-amber-300">이미 충분히 작습니다 (지금 설정으로는 더 커집니다)</span>
                    ) : (
                      <span className="text-xs text-primary">예상 {formatBytes(item.plan.estimatedBytes)} ({item.plan.width}×{item.plan.height})</span>
                    )
                  )}
                  {item.state === 'done' && item.result && (
                    <>
                      <span className="text-xs text-emerald-400">
                        {formatBytes(item.result.size)} · {Math.round((1 - item.result.size / item.file.size) * 100)}% 줄어듦
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setCompare(item)}>비교</Button>
                      <Button size="sm" variant="ghost" onClick={() => downloadBlob(item.result!, `${baseName(item.file.name)}_압축.mp4`)}><Download /></Button>
                    </>
                  )}
                  {item.state === 'failed' && <span className="text-xs text-red-400">실패</span>}
                  {!running && (
                    <Button size="sm" variant="ghost" aria-label={`${item.file.name} 빼기`} onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}>
                      <X />
                    </Button>
                  )}
                </div>
                {item.state === 'working' && <Progress className="mt-1.5 h-1.5" value={item.ratio * 100} aria-label={`${item.file.name} 진행률`} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="얼마나 줄일까요?">
        <div role="radiogroup" aria-label="압축 방식" className="space-y-1.5">
          {COMPRESS_PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={presetId === p.id}
              onClick={() => { setPresetId(p.id); setItems((prev) => replan(prev, p.id)); }}
              className={cn('w-full rounded-md border p-2.5 text-left', presetId === p.id ? 'border-primary bg-primary/10' : 'hover:bg-accent')}>
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </button>
          ))}
        </div>
        {presetId === 'target' && (
          <div className="space-y-1">
            <Label htmlFor="target-mb" className="text-xs">목표 용량 (MB)</Label>
            <Input id="target-mb" className="h-9 w-32" inputMode="decimal" value={targetMB}
              onChange={(e) => { setTargetMB(e.target.value); setItems((prev) => replan(prev, presetId, Number(e.target.value) || undefined)); }} />
            <p className="text-[11px] text-muted-foreground">
              길이에 맞춰 비트레이트를 역산합니다. 목표를 넘지는 않으며, 화면 변화가 적은 영상은 목표보다 훨씬 작게 나올 수 있습니다.
            </p>
          </div>
        )}
      </Section>

      {running ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <Progress value={overall * 100} aria-label="전체 진행률" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <ElapsedTimer startedAt={running.startedAt} className="tabular-nums" />
            <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}><X /> 취소</Button>
          </div>
        </div>
      ) : (
        <Button size="lg" disabled={items.length === 0} onClick={() => void runAll()}><Play /> 용량 줄이기</Button>
      )}

      {compare?.result && (
        <CompareView original={compare.file} compressed={compare.result} onClose={() => setCompare(null)} />
      )}
    </div>
  );
}
