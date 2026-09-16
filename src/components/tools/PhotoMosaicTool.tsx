'use client';

import { Download, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { MosaicMode } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { toAppError } from '@/lib/errors';
import { outputFileName } from '@/lib/tools/imageOps';
import { downloadBlob } from '@/lib/utils';
import { renderMosaicRegion } from '@/lib/vision/mosaicRender';
import { scaleBox } from '@/lib/vision/tracker';
import { visionWorker } from '@/lib/worker/instances';
import { createZip } from '@/lib/zip';
import { useUiStore } from '@/store/uiStore';

interface Done { name: string; blob: Blob; url: string; faces: number }

const DETECT_MAX = 1280;

export function PhotoMosaicTool() {
  const [mode, setMode] = useState<MosaicMode>('pixelate');
  const [intensity, setIntensity] = useState(32);
  const [scale, setScale] = useState(1.3);
  const [results, setResults] = useState<Done[]>([]);
  const [ratio, setRatio] = useState<number | null>(null);

  const run = async (files: File[]) => {
    setRatio(0);
    results.forEach((r) => URL.revokeObjectURL(r.url));
    const out: Done[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const full = await createImageBitmap(file);
        const k = Math.min(1, DETECT_MAX / Math.max(full.width, full.height));
        // 검출은 줄인 사본으로(빠름), 가리기는 원본 해상도에서 — 좌표가 0~1 정규화라 그대로 맞는다
        const small = await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k) });
        const { detections } = await visionWorker().call('detectBatch', { frames: [small], timesMs: [0], mode: 'IMAGE' }, { transfer: [small] });
        const canvas = new OffscreenCanvas(full.width, full.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.drawImage(full, 0, 0);
        full.close();
        for (const d of detections[0] ?? []) renderMosaicRegion(ctx, scaleBox(d, scale), { mode, intensity, shape: 'ellipse', emoji: '😊' });
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        out.push({ name: outputFileName(file.name, 'jpeg'), blob, url: URL.createObjectURL(blob), faces: detections[0]?.length ?? 0 });
      } catch (e) {
        const err = toAppError(e);
        useUiStore.getState().toast({ kind: 'error', title: `${file.name}: ${err.message}`, hint: err.hint });
      }
      setRatio((i + 1) / files.length);
      setResults([...out]);
    }
    setRatio(null);
  };

  const downloadZip = async () => {
    const zip = createZip(await Promise.all(results.map(async (r) => ({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) }))));
    downloadBlob(new Blob([zip], { type: 'application/zip' }), '편집ON_얼굴가림.zip');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Section title="사진 얼굴 일괄 가리기" description="사진 여러 장을 올리면 얼굴을 자동으로 찾아 가리고 ZIP으로 묶어 줍니다. 사진은 이 컴퓨터 밖으로 나가지 않습니다.">
        <Segmented label="가리는 방식" value={mode} options={[['pixelate', '픽셀'], ['blur', '흐리게'], ['box', '검은 박스'], ['emoji', '이모지']]} onChange={setMode} />
        {(mode === 'pixelate' || mode === 'blur') && <SliderField label="강도" value={intensity} min={4} max={80} onChange={setIntensity} />}
        <SliderField label="가리는 영역 크기" value={scale} min={1} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}배`} onChange={setScale} />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-primary">
          <EyeOff className="h-5 w-5" /> 사진 선택 (여러 장)
          <input type="file" accept="image/*" multiple className="hidden" disabled={ratio !== null}
            onChange={(e) => { const list = Array.from(e.target.files ?? []); if (list.length) void run(list); e.target.value = ''; }} />
        </label>
        {ratio !== null && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> 처리 중 {Math.round(ratio * 100)}%</p>
            <Progress value={ratio * 100} aria-label="사진 처리 진행률" />
          </div>
        )}
      </Section>
      <Section title={`결과 ${results.length}장`} actions={results.length > 0 && <Button size="sm" onClick={() => void downloadZip()}><Download /> ZIP으로 받기</Button>}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((r) => (
            <li key={r.url} className="space-y-1">
              <button type="button" className="block w-full" onClick={() => downloadBlob(r.blob, r.name)} aria-label={`${r.name} 받기`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={`${r.name} 결과`} className="aspect-square w-full rounded border object-cover" />
              </button>
              <p className="truncate text-xs text-muted-foreground">{r.faces ? `얼굴 ${r.faces}개 가림` : '얼굴 못 찾음'}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
