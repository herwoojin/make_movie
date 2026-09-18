// 더빙 믹싱 (F-06). OfflineAudioContext로 한 번에 계산해 WAV로 만든다.
// 영상은 건드리지 않는다 — 나중에 소리만 갈아 끼운다.
import { AppError } from '@/lib/errors';
import { duckGainCurve, gainAutomationPoints, DEFAULT_DUCK, dbToGain } from './ducking';
import { frameLevelsDb, FRAME_MS } from './silence';

export type BaseAudioMode = 'replace' | 'keep';

export interface MixOptions {
  /** 원본 소리를 없앨지, 배경으로 남길지 */
  mode: BaseAudioMode;
  /** 배경으로 남길 때의 볼륨 (0~1) */
  baseVolume: number;
  /** 얹는 소리의 볼륨 (0~1) */
  overlayVolume: number;
  /** 얹는 소리를 앞뒤로 미는 양 (ms, 음수면 당긴다) */
  offsetMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** 말하는 구간에서 배경(원본)을 낮출지 — 나레이션을 얹을 때 쓴다 */
  ducking: boolean;
}

export const DEFAULT_MIX: MixOptions = {
  mode: 'keep',
  baseVolume: 0.25,
  overlayVolume: 1,
  offsetMs: 0,
  fadeInMs: 300,
  fadeOutMs: 500,
  ducking: true,
};

export interface MixInput {
  /** 영상의 원래 소리 (없을 수 있다) */
  base: AudioBuffer | null;
  /** 새로 얹는 소리 */
  overlay: AudioBuffer;
  /** 결과 길이 (보통 영상 길이) */
  durationMs: number;
}

function offlineContext(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  const Ctor = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Ctor) throw new AppError('DECODE_FAILED', '이 브라우저에서는 소리를 합칠 수 없습니다.', 'Chrome·Edge 최신 버전을 써 주세요.');
  return new Ctor(channels, length, sampleRate);
}

/** 두 소리를 합쳐 하나의 PCM으로 (영상 길이에 맞춘다) */
export async function mixAudio(input: MixInput, opts: MixOptions): Promise<AudioBuffer> {
  const sampleRate = Math.max(input.overlay.sampleRate, input.base?.sampleRate ?? 0) || 48_000;
  const channels = Math.max(1, Math.min(2, Math.max(input.overlay.numberOfChannels, input.base?.numberOfChannels ?? 1)));
  const length = Math.max(1, Math.round((input.durationMs / 1000) * sampleRate));
  const ctx = offlineContext(channels, length, sampleRate);

  // ① 원본 소리 (배경으로 남길 때만)
  if (input.base && opts.mode === 'keep') {
    const src = ctx.createBufferSource();
    src.buffer = input.base;
    const gain = ctx.createGain();
    gain.gain.value = opts.baseVolume;

    if (opts.ducking) {
      // 얹는 소리가 말하는 구간에서 배경을 낮춘다
      const mono = input.overlay.getChannelData(0);
      const levels = frameLevelsDb(mono, input.overlay.sampleRate);
      const curve = duckGainCurve(levels, DEFAULT_DUCK);
      const offsetSec = Math.max(0, opts.offsetMs) / 1000;
      gain.gain.setValueAtTime(opts.baseVolume, 0);
      for (const point of gainAutomationPoints(curve, FRAME_MS)) {
        const at = offsetSec + point.timeSec;
        if (at > length / sampleRate) break;
        gain.gain.linearRampToValueAtTime(opts.baseVolume * point.value, at);
      }
    }
    src.connect(gain).connect(ctx.destination);
    src.start(0);
  }

  // ② 얹는 소리 (싱크 오프셋 + 페이드)
  const over = ctx.createBufferSource();
  over.buffer = input.overlay;
  const overGain = ctx.createGain();
  const startSec = Math.max(0, opts.offsetMs) / 1000;
  const skipSec = Math.max(0, -opts.offsetMs) / 1000;
  const playSec = Math.max(0, input.overlay.duration - skipSec);
  const endSec = Math.min(length / sampleRate, startSec + playSec);

  overGain.gain.setValueAtTime(opts.fadeInMs > 0 ? 0 : opts.overlayVolume, startSec);
  if (opts.fadeInMs > 0) overGain.gain.linearRampToValueAtTime(opts.overlayVolume, startSec + opts.fadeInMs / 1000);
  if (opts.fadeOutMs > 0 && endSec > startSec) {
    overGain.gain.setValueAtTime(opts.overlayVolume, Math.max(startSec, endSec - opts.fadeOutMs / 1000));
    overGain.gain.linearRampToValueAtTime(0, endSec);
  }
  over.connect(overGain).connect(ctx.destination);
  over.start(startSec, skipSec);

  return ctx.startRendering();
}

/** AudioBuffer → 16bit PCM WAV */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  text(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export const gainFromDb = dbToGain;
