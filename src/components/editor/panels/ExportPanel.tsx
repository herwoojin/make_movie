'use client';

import { Download, FileJson } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Section } from '@/components/ui/field';
import { Label, NativeSelect, Switch } from '@/components/ui/misc';
import { clipSpeedRanges } from '@/lib/core/clips';
import { outputDurationMs } from '@/lib/core/edl';
import { formatDuration } from '@/lib/core/timecode';
import { estimateExportMs, runExport, type ExportResult, type UsedEncoder } from '@/lib/encode';
import { EXPORT_PRESETS, getPreset, resolveOutputSize } from '@/lib/encode/presets';
import { settings, type EncoderPreference } from '@/lib/settings';
import { getDb } from '@/lib/storage/db';
import { buildProjectFile } from '@/lib/storage/projectRepo';
import { cn, downloadBlob, formatBytes } from '@/lib/utils';
import type { Progress } from '@/lib/worker/protocol';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { ExportProgressView } from './ExportProgressView';

export function ExportPanel() {
  const asset = useProjectStore((s) => s.asset);
  const doc = useProjectStore((s) => s.doc);
  const holdMs = useProjectStore((s) => s.mosaicHoldMs);
  const [presetId, setPresetId] = useState('youtube-1080p');
  const [encoderPref, setEncoderPref] = useState<EncoderPreference>('auto');
  const [burn, setBurn] = useState(true);
  const [mosaic, setMosaic] = useState(true);
  const [run, setRun] = useState<{ progress: Progress | null; startedAt: number; encoder: UsedEncoder | null } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [slowMs, setSlowMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setPresetId(settings.getExportPreset()); setEncoderPref(settings.getEncoder()); }, []);

  const hasCues = doc.clips.some((c) => c.enabled && c.captionText.trim());
  const hasTracks = doc.tracks.some((t) => t.enabled && t.keyframes.length > 0);
  const preset = getPreset(presetId);
  const isVideo = preset.format === 'mp4' || preset.format === 'gif';
  const opts = { presetId, encoderPref, burnSubtitles: burn && hasCues && isVideo, applyMosaic: mosaic && hasTracks && isVideo, mosaicHoldMs: holdMs };
  const estimate = useMemo(() => (asset ? estimateExportMs(asset, doc, opts) : null), [asset, doc, presetId, encoderPref, burn, mosaic]); // eslint-disable-line react-hooks/exhaustive-deps
  const size = asset ? resolveOutputSize(preset, asset.width ?? 0, asset.height ?? 0) : null;
  const outMs = outputDurationMs(doc.edl, clipSpeedRanges(doc.clips), doc.view.globalSpeed);

  const start = async () => {
    const { project, asset: a, source } = useProjectStore.getState();
    if (!project || !a || !source) return;
    await useProjectStore.getState().flush();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setResult(null);
    setRun({ progress: null, startedAt: Date.now(), encoder: null });
    const baseTitle = document.title;
    try {
      const res = await runExport({
        project, asset: a, source, doc: useProjectStore.getState().doc, ...opts, signal: ctrl.signal,
        onProgress: (p) => {
          setRun((r) => r && { ...r, progress: p });
          if (p.total > 0) document.title = `(${Math.round((p.done / p.total) * 100)}%) 내보내는 중 · 편집ON`;
        },
        onEncoder: (encoder, reason) => {
          setRun((r) => r && { ...r, encoder });
          if (reason) useUiStore.getState().toast({ kind: 'info', title: '예비 인코더(ffmpeg)로 내보냅니다.', hint: reason });
        },
      });
      setResult(res);
      downloadBlob(res.blob, res.fileName);
      await getDb().projects.update(project.id, { status: 'done' });
      useUiStore.getState().toast({ kind: 'success', title: '내보내기가 끝났습니다.', hint: `${formatBytes(res.blob.size)} · ${formatDuration(res.elapsedMs)} 걸림. 다운로드 폴더를 확인하세요.` });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setRun(null);
      document.title = baseTitle;
    }
  };

  const requestStart = () => {
    if (estimate?.encoder === 'ffmpeg-wasm' && estimate.ms > 10 * 60 * 1000) setSlowMs(estimate.ms);
    else void start();
  };

  if (run) return <ExportProgressView run={run} onCancel={() => abortRef.current?.abort()} />;

  return (
    <>
      <Section title="어디에 올릴 영상인가요?">
        <div role="radiogroup" aria-label="내보내기 프리셋" className="space-y-1.5">
          {EXPORT_PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={presetId === p.id} onClick={() => { setPresetId(p.id); settings.setExportPreset(p.id); }}
              className={cn('w-full rounded-md border p-2.5 text-left', presetId === p.id ? 'border-primary bg-primary/10' : 'hover:bg-accent')}>
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="넣을 것">
        <label className="flex items-center justify-between text-sm">자막 굽기 {!hasCues && <span className="text-xs text-muted-foreground">(자막 없음)</span>}
          <Switch checked={burn && hasCues} disabled={!hasCues || !isVideo} onCheckedChange={setBurn} aria-label="자막 굽기" /></label>
        <label className="flex items-center justify-between text-sm">모자이크 적용 {!hasTracks && <span className="text-xs text-muted-foreground">(가릴 대상 없음)</span>}
          <Switch checked={mosaic && hasTracks} disabled={!hasTracks || !isVideo} onCheckedChange={setMosaic} aria-label="모자이크 적용" /></label>
        <div className="space-y-1">
          <Label htmlFor="export-encoder" className="text-xs">인코더 (영상을 다시 압축하는 엔진)</Label>
          <NativeSelect id="export-encoder" className="h-9" value={encoderPref} onChange={(e) => { const v = e.target.value as EncoderPreference; setEncoderPref(v); settings.setEncoder(v); }}>
            <option value="auto">자동 (권장)</option>
            <option value="webcodecs">빠른 인코더 (그래픽카드)</option>
            <option value="ffmpeg-wasm">예비 인코더 (ffmpeg, 느림)</option>
          </NativeSelect>
        </div>
      </Section>

      <Section title="요약">
        <ul className="space-y-1 text-sm">
          <li>결과 길이: {formatDuration(outMs)}</li>
          {size && isVideo && <li>화면 크기: {size.width}×{size.height}</li>}
          {estimate && <li>예상 시간: 약 {formatDuration(Math.max(1000, estimate.ms))} ({estimate.encoder === 'webcodecs' ? '빠른 인코더' : estimate.encoder === 'native' ? '브라우저 기본' : '예비 인코더'})</li>}
          {preset.format === 'gif' && outMs > 30_000 && <li className="text-amber-300">GIF는 30초가 넘으면 용량이 매우 커집니다. 짧게 잘라서 쓰세요.</li>}
        </ul>
        <Button size="lg" className="w-full" disabled={outMs <= 0} onClick={requestStart}><Download /> 내보내기</Button>
        <p className="text-xs text-muted-foreground">다른 탭을 봐도 계속됩니다. 이 창은 닫지 마세요.</p>
        {result && (
          <Button variant="secondary" size="sm" onClick={() => downloadBlob(result.blob, result.fileName)}>
            <Download /> 다시 받기 ({formatBytes(result.blob.size)})
          </Button>
        )}
      </Section>

      <Section title="프로젝트 파일" description="편집 결정만 담긴 작은 파일(.editon.json)입니다. 영상은 들어 있지 않습니다.">
        <Button size="sm" variant="outline" onClick={async () => {
          const project = useProjectStore.getState().project;
          if (!project) return;
          await useProjectStore.getState().flush();
          const json = await buildProjectFile(project.id);
          downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `${project.name}.editon.json`);
        }}><FileJson /> 프로젝트 파일 저장</Button>
      </Section>

      <Dialog open={slowMs !== null} onOpenChange={(o) => !o && setSlowMs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>시간이 오래 걸립니다</DialogTitle>
            <DialogDescription>
              이 브라우저에서는 예비 인코더를 써야 해서 약 {formatDuration(slowMs ?? 0)} 걸릴 것으로 보입니다. Chrome·Edge에서는 훨씬 빠릅니다. 그래도 진행할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSlowMs(null)}>취소</Button>
            <Button onClick={() => { setSlowMs(null); void start(); }}>진행</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
