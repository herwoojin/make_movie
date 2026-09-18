'use client';

// 원본 vs 압축본 비교 (F-10-3). 같은 시각의 프레임을 좌우로 갈라서 보여 준다.
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export function CompareView({ original, compressed, onClose }: { original: Blob; compressed: Blob; onClose: () => void }) {
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(50);
  const [urls, setUrls] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    const a = URL.createObjectURL(original);
    const b = URL.createObjectURL(compressed);
    setUrls({ a, b });
    return () => { URL.revokeObjectURL(a); URL.revokeObjectURL(b); };
  }, [original, compressed]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    const canvas = canvasRef.current;
    if (!left || !right || !canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!ctx || left.readyState < 2) return;
      const w = canvas.width;
      const h = canvas.height;
      // 오른쪽 영상은 왼쪽 시계를 따라간다 (같은 프레임을 비교하기 위해)
      if (Math.abs(right.currentTime - left.currentTime) > 0.08) right.currentTime = left.currentTime;
      const x = Math.round((split / 100) * w);
      ctx.drawImage(left, 0, 0, w, h);
      if (right.readyState >= 2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, w - x, h);
        ctx.clip();
        ctx.drawImage(right, 0, 0, w, h);
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 1, 0, 2, h);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [split, urls]);

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">원본(왼쪽) vs 압축본(오른쪽)</p>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}><X /> 닫기</Button>
      </div>
      <video ref={leftRef} src={urls?.a} controls muted playsInline className="h-16 w-full rounded bg-black" aria-label="원본 재생 (여기서 재생하면 아래 비교 화면이 따라갑니다)" />
      <video ref={rightRef} src={urls?.b} muted playsInline aria-hidden className="pointer-events-none absolute h-px w-px opacity-0" />
      <canvas ref={canvasRef} width={960} height={540} className="w-full rounded bg-black" role="img" aria-label="원본과 압축본 비교 화면" />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        가르는 위치
        <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="flex-1" aria-label="비교 경계 위치" />
      </label>
    </div>
  );
}
