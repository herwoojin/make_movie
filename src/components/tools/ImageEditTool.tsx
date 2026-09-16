'use client';

import { Download, FlipHorizontal, Image as ImageIcon, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { outputFileName, planImageEdit, type ImageEditParams, type Rotation } from '@/lib/tools/imageOps';
import { downloadBlob, formatBytes } from '@/lib/utils';
import { createZip } from '@/lib/zip';
import { useUiStore } from '@/store/uiStore';

type Format = 'jpeg' | 'png' | 'webp';

async function render(bitmap: ImageBitmap, p: ImageEditParams, format: Format, quality: number): Promise<Blob> {
  const plan = planImageEdit(bitmap.width, bitmap.height, p);
  const canvas = new OffscreenCanvas(plan.output.width, plan.output.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  if (format === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.scale(p.flipX ? -1 : 1, 1);
  const w = plan.source.w * plan.scale;
  const h = plan.source.h * plan.scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, plan.source.x, plan.source.y, plan.source.w, plan.source.h, -w / 2, -h / 2, w, h);
  return canvas.convertToBlob({ type: `image/${format}`, quality: format === 'png' ? undefined : quality });
}

export function ImageEditTool() {
  const [files, setFiles] = useState<{ file: File; bitmap: ImageBitmap }[]>([]);
  const [params, setParams] = useState<ImageEditParams>({ rotation: 0, flipX: false, crop: { left: 0, top: 0, right: 0, bottom: 0 }, targetWidth: 0 });
  const [format, setFormat] = useState<Format>('jpeg');
  const [quality, setQuality] = useState(85);
  const [preview, setPreview] = useState<{ url: string; size: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 설정을 바꾸면 첫 장으로 결과 미리보기 + 예상 용량 (300ms 디바운스)
  useEffect(() => {
    const first = files[0];
    if (!first) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      render(first.bitmap, params, format, quality / 100).then((blob) => {
        setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), size: blob.size }; });
      }).catch(() => undefined);
    }, 300);
  }, [files, params, format, quality]);

  const setCrop = (k: keyof ImageEditParams['crop'], v: number) => setParams((p) => ({ ...p, crop: { ...p.crop, [k]: v / 100 } }));

  const save = async () => {
    try {
      const outs = await Promise.all(files.map(async ({ file, bitmap }) => ({ name: outputFileName(file.name, format), blob: await render(bitmap, params, format, quality / 100) })));
      if (outs.length === 1) downloadBlob(outs[0].blob, outs[0].name);
      else {
        const zip = createZip(await Promise.all(outs.map(async (o) => ({ name: o.name, data: new Uint8Array(await o.blob.arrayBuffer()) }))));
        downloadBlob(new Blob([zip], { type: 'application/zip' }), '편집ON_이미지.zip');
      }
    } catch (e) {
      useUiStore.getState().showError(e);
    }
  };

  const first = files[0];
  const plan = first ? planImageEdit(first.bitmap.width, first.bitmap.height, params) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Section title="편집 설정" description="여러 장을 고르면 모두 같은 설정으로 바뀌고 ZIP으로 받습니다.">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-primary">
          <ImageIcon className="h-5 w-5" /> {files.length ? `${files.length}장 선택됨` : '이미지 선택 (여러 장 가능)'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            try {
              setFiles(await Promise.all(list.map(async (file) => ({ file, bitmap: await createImageBitmap(file) }))));
            } catch (err) {
              useUiStore.getState().showError(err);
            }
          }} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setParams((p) => ({ ...p, rotation: ((p.rotation + 90) % 360) as Rotation }))}><RotateCw /> 90° 회전</Button>
          <Button size="sm" variant="secondary" aria-pressed={params.flipX} onClick={() => setParams((p) => ({ ...p, flipX: !p.flipX }))}><FlipHorizontal /> 좌우 뒤집기</Button>
        </div>
        <SliderField label="왼쪽 자르기" value={Math.round(params.crop.left * 100)} min={0} max={45} format={(v) => `${v}%`} onChange={(v) => setCrop('left', v)} />
        <SliderField label="오른쪽 자르기" value={Math.round(params.crop.right * 100)} min={0} max={45} format={(v) => `${v}%`} onChange={(v) => setCrop('right', v)} />
        <SliderField label="위 자르기" value={Math.round(params.crop.top * 100)} min={0} max={45} format={(v) => `${v}%`} onChange={(v) => setCrop('top', v)} />
        <SliderField label="아래 자르기" value={Math.round(params.crop.bottom * 100)} min={0} max={45} format={(v) => `${v}%`} onChange={(v) => setCrop('bottom', v)} />
        <SliderField label="가로 크기" value={params.targetWidth} min={0} max={4000} step={20} format={(v) => (v ? `${v}px` : '원본 그대로')} onChange={(v) => setParams((p) => ({ ...p, targetWidth: v }))} />
        <Segmented label="저장 형식" value={format} options={[['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']]} onChange={setFormat} />
        {format !== 'png' && <SliderField label="화질 (낮출수록 용량이 작아짐)" value={quality} min={10} max={100} format={(v) => `${v}%`} onChange={setQuality} />}
        <Button disabled={!files.length} onClick={() => void save()}><Download /> 저장 {files.length > 1 ? '(ZIP)' : ''}</Button>
      </Section>
      <Section title="미리보기">
        {preview && plan ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="편집 결과 미리보기" className="max-h-[60vh] w-auto rounded border" />
            <p className="text-xs text-muted-foreground">{plan.output.width}×{plan.output.height} · 약 {formatBytes(preview.size)} (원본 {formatBytes(first!.file.size)})</p>
          </div>
        ) : <p className="text-sm text-muted-foreground">이미지를 고르면 결과가 여기에 보입니다.</p>}
      </Section>
    </div>
  );
}
