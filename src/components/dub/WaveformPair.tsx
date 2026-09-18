'use client';

// 싱크 맞추기용 파형 2줄 (F-06-3). 위: 영상의 원래 소리, 아래: 얹는 소리(시작 위치만큼 밀림).
import { useEffect, useRef } from 'react';
import { computePeaks } from '@/lib/audio/peaks';

const HEIGHT = 40;

function drawPeaks(ctx: CanvasRenderingContext2D, peaks: Int8Array, x0: number, width: number, y: number, color: string): void {
  if (width <= 0 || peaks.length < 2) return;
  ctx.fillStyle = color;
  const pairs = Math.floor(peaks.length / 2);
  for (let px = 0; px < width; px++) {
    const i = Math.min(pairs - 1, Math.floor((px / width) * pairs));
    const min = peaks[i * 2] / 127;
    const max = peaks[i * 2 + 1] / 127;
    const top = y + HEIGHT / 2 - (max * HEIGHT) / 2;
    const h = Math.max(1, ((max - min) * HEIGHT) / 2);
    ctx.fillRect(x0 + px, top, 1, h);
  }
}

export function WaveformPair({
  base, overlay, durationMs, offsetMs,
}: { base: AudioBuffer | null; overlay: AudioBuffer; durationMs: number; offsetMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.width;
    ctx.clearRect(0, 0, width, canvas.height);

    const total = Math.max(1, durationMs);
    const pxPerMs = width / total;

    if (base) {
      const peaks = computePeaks(base.getChannelData(0), base.sampleRate, 50);
      drawPeaks(ctx, peaks, 0, Math.round(base.duration * 1000 * pxPerMs), 0, 'rgba(148,163,184,0.8)');
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.fillRect(0, HEIGHT / 2, width, 1);
    }

    const peaks = computePeaks(overlay.getChannelData(0), overlay.sampleRate, 50);
    const x0 = Math.round(Math.max(0, offsetMs) * pxPerMs);
    drawPeaks(ctx, peaks, x0, Math.round(overlay.duration * 1000 * pxPerMs), HEIGHT + 8, 'rgba(56,189,248,0.9)');
  }, [base, overlay, durationMs, offsetMs]);

  return (
    <canvas
      ref={ref}
      width={800}
      height={HEIGHT * 2 + 8}
      className="w-full rounded bg-muted/40"
      role="img"
      aria-label="위: 원래 소리 파형, 아래: 얹는 소리 파형"
    />
  );
}
