// WebCodecs 렌더 파이프라인 (TRD 4.6 1순위 경로). encode.worker 안에서 실행된다.
// mp4box 디먹스 → VideoDecoder → OffscreenCanvas(모자이크 → 자막) → VideoEncoder → mp4-muxer
// 오디오: AudioDecoder → 유지 구간 이어붙이기(5ms 크로스페이드) → AudioEncoder
import { ArrayBufferTarget, Muxer, StreamTarget } from 'mp4-muxer';
import { createTimeMap, keptRanges } from '@/lib/core/edl';
import { AppError, throwIfAborted, toAppError } from '@/lib/errors';
import { ensureSubtitleFonts } from '@/lib/fonts';
import { buildPalette, GifEncoder } from '@/lib/gif/encoder';
import { openSyncHandle, type SyncHandle } from '@/lib/storage/opfsSync';
import { activeCueAt } from '@/lib/subtitle/model';
import { renderSubtitleToCanvas } from '@/lib/subtitle/render';
import { drawSourceFrame } from '@/lib/render/frame';
import { renderMosaicFrame } from '@/lib/vision/mosaicRender';
import type { Progress } from '@/lib/worker/protocol';
import { AudioSplicer, CROSSFADE_MS, LinearResampler, msRangesToSamples, planarToBuffer } from '../audioSplice';
import { hasSpeedChange, speedSpansToSamples, VariableSpeedResampler } from '../speedAudio';
import type { RenderJob } from '../types';
import { Mp4Demuxer, sampleDurationUs, sampleTimeUs } from './demux';

export interface RenderResult {
  path?: string;
  buffer?: ArrayBuffer;
  bytes: number;
  mime: string;
}

async function pickVideoConfig(width: number, height: number, bitrate: number, framerate: number): Promise<VideoEncoderConfig> {
  const level = framerate > 30 ? '2a' : '28';
  const codecs = [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`];
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate, hardwareAcceleration, avc: { format: 'avc' }, latencyMode: 'quality' };
      const support = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (support?.supported) return config;
    }
  }
  throw new AppError('UNSUPPORTED_CODEC', '이 브라우저에서 MP4(H.264) 인코딩을 지원하지 않습니다.', '설정에서 인코더를 ffmpeg로 바꾸거나 Chrome을 써보세요.');
}

async function pickAudioConfig(sampleRate: number, channels: number): Promise<{ codec: 'aac' | 'opus'; config: AudioEncoderConfig } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const aac: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 128_000 };
  if ((await AudioEncoder.isConfigSupported(aac).catch(() => null))?.supported) return { codec: 'aac', config: aac };
  // AAC 인코더가 없는 환경(일부 리눅스 Chromium): MP4 안에 Opus로 담는다. Opus는 48kHz 고정
  const opus: AudioEncoderConfig = { codec: 'opus', sampleRate: 48_000, numberOfChannels: channels, bitrate: 128_000 };
  if ((await AudioEncoder.isConfigSupported(opus).catch(() => null))?.supported) return { codec: 'opus', config: opus };
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function closeQuietly(codec: { state: string; close(): void } | null): void {
  try {
    if (codec && codec.state !== 'closed') codec.close();
  } catch {
    // 이미 오류로 닫힌 코덱
  }
}

export async function renderWithWebCodecs(
  file: Blob, job: RenderJob, outPath: string | undefined, onProgress: (p: Progress) => void, signal: AbortSignal,
): Promise<RenderResult> {
  const ranges = keptRanges(job.edl);
  if (ranges.length === 0) throw new AppError('ENCODE_FAILED', '남은 구간이 없어 내보낼 것이 없습니다.', '타임라인에서 최소 한 구간을 살려 주세요.');
  // 원본 → 컷 → 배속 → 결과물. 이 표 하나로 프레임 시각과 자막·오디오 길이가 모두 결정된다
  const timeMap = createTimeMap(job.edl, job.speeds ?? [], job.globalSpeed ?? 1);
  const lastEndMs = ranges[ranges.length - 1].endMs;
  const view = { aspectMode: 'original' as const, fillMode: 'blur' as const, reframe: { x: 0.5, y: 0.5, scale: 1 }, ...job.view, fallbackFit: job.output.fit };

  const demux = await Mp4Demuxer.open(file, signal);
  const v = demux.info.video;
  if (!v) throw new AppError('UNSUPPORTED_FORMAT', '영상 트랙이 없는 파일입니다.', '영상 파일을 올려 주세요.');
  if (!(await VideoDecoder.isConfigSupported(v.config).catch(() => null))?.supported) {
    throw new AppError('UNSUPPORTED_CODEC', `이 브라우저가 원본 영상 형식(${v.codec})을 풀지 못합니다.`, '설정에서 인코더를 ffmpeg로 바꿔 보세요.');
  }

  const { width: W, height: H, fps, format } = job.output;
  const isGif = format === 'gif';
  const cues = job.subtitles ?? [];
  const burn = cues.length > 0 && !!job.style;
  const mosaic = (job.mosaicTracks ?? []).filter((t) => t.enabled && t.keyframes.length > 0);
  if (burn) await ensureSubtitleFonts();

  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d', { willReadFrequently: isGif });
  if (!octx) throw new AppError('ENCODE_FAILED', '그리기 화면(캔버스)을 만들 수 없습니다.');
  // 모자이크는 원본 좌표계에서 그려야 하므로 항상 중간 화면(stage)에 먼저 그린다
  let stage: OffscreenCanvas | null = null;
  let sctx: OffscreenCanvasRenderingContext2D | null = null;
  let stageW = 0;
  let stageH = 0;

  let failure: unknown = null;
  const fail = (e: unknown) => { failure ??= e; };

  let sync: SyncHandle | null = null;
  let videoDecoder: VideoDecoder | null = null;
  let videoEncoder: VideoEncoder | null = null;
  let audioDecoder: AudioDecoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  try {
    // ── 출력 준비 ─────────────────────────────────────────
    const a = !isGif && job.hasAudio ? demux.info.audio : null;
    let audioPlan: { enc: { codec: 'aac' | 'opus'; config: AudioEncoderConfig }; outCh: number } | null = null;
    if (a && typeof AudioDecoder !== 'undefined' && (await AudioDecoder.isConfigSupported(a.config).catch(() => null))?.supported) {
      const outCh = Math.min(2, Math.max(1, a.channels));
      const enc = await pickAudioConfig(a.sampleRate, outCh);
      if (enc) audioPlan = { enc, outCh };
    }

    let muxer: Muxer<StreamTarget> | Muxer<ArrayBufferTarget> | null = null;
    let bufferTarget: ArrayBufferTarget | null = null;
    if (!isGif) {
      const vConfig = await pickVideoConfig(W, H, job.output.bitrate, fps);
      if (outPath) {
        try {
          sync = await openSyncHandle(outPath);
          sync.truncate(0);
        } catch {
          sync = null;
        }
      }
      const handle = sync;
      const muxOptions = {
        // mp4-muxer는 트랙 timescale 계산에 정수 fps만 받는다 (29.97 같은 값은 반올림 — 실제 프레임 시각은 타임스탬프가 결정)
        video: { codec: 'avc' as const, width: W, height: H, frameRate: Math.max(1, Math.round(fps)) },
        audio: audioPlan ? { codec: audioPlan.enc.codec, numberOfChannels: audioPlan.outCh, sampleRate: audioPlan.enc.config.sampleRate } : undefined,
        firstTimestampBehavior: 'offset' as const,
      };
      if (handle) {
        // 결과를 OPFS에 바로 흘려 쓴다 — 20분 1080p도 메모리에 통째로 올리지 않는다
        muxer = new Muxer({ ...muxOptions, target: new StreamTarget({ onData: (data, position) => { handle.write(data, { at: position }); } }), fastStart: false });
      } else {
        bufferTarget = new ArrayBufferTarget();
        muxer = new Muxer({ ...muxOptions, target: bufferTarget, fastStart: 'in-memory' });
      }
      const mux = muxer;
      videoEncoder = new VideoEncoder({ output: (chunk, meta) => mux.addVideoChunk(chunk, meta), error: fail });
      videoEncoder.configure(vConfig);
    }

    // ── 비디오 프레임 합성 ─────────────────────────────────
    const frameDurUs = 1e6 / fps;
    const gop = Math.max(1, Math.round(fps * 2));
    let nextDueUs = 0;
    let lastTsUs = -1;
    let frameIndex = 0;
    let gif: GifEncoder | null = null;
    const gifSamples: Uint8ClampedArray[] = [];
    const startGif = () => {
      if (gif || gifSamples.length === 0) return;
      gif = new GifEncoder(W, H, buildPalette(gifSamples, 256));
      for (const px of gifSamples) gif.addFrame(px, 1000 / fps);
      gifSamples.length = 0;
    };

    const handleFrame = (frame: VideoFrame) => {
      try {
        if (failure) return;
        const srcMs = frame.timestamp / 1000;
        const outMs = timeMap.toOutput(srcMs);
        if (outMs === null) return;
        const outUs = Math.round(outMs * 1000);
        // 목표 fps보다 촘촘한 프레임은 버린다 (60fps 원본 → 30fps 출력 등)
        if (outUs < nextDueUs - frameDurUs / 2) return;
        nextDueUs = (Math.floor(outUs / frameDurUs) + 1) * frameDurUs;

        if (!sctx || !stage) {
          // 결과 화면을 덮을 만큼만 크게 — 잘라내기로 확대했으면 그만큼 더 크게
          const zoom = view.aspectMode !== 'original' && view.fillMode === 'crop' ? Math.max(1, view.reframe.scale) : 1;
          const k = Math.min(1, Math.max(W / frame.displayWidth, H / frame.displayHeight) * zoom);
          stageW = Math.max(2, Math.round(frame.displayWidth * k));
          stageH = Math.max(2, Math.round(frame.displayHeight * k));
          stage = new OffscreenCanvas(stageW, stageH);
          const c = stage.getContext('2d');
          if (!c) throw new AppError('ENCODE_FAILED', '그리기 화면(캔버스)을 만들 수 없습니다.');
          sctx = c;
        }
        sctx.drawImage(frame, 0, 0, stageW, stageH);
        // 모자이크는 원본 비율 화면에서 먼저, 자막은 최종 화면 위에 나중에 (자막이 가려지지 않게)
        if (mosaic.length) renderMosaicFrame(sctx, mosaic, srcMs, job.mosaicHoldMs);
        drawSourceFrame(octx, stage, stageW, stageH, W, H, view);
        if (burn && job.style) {
          const cue = activeCueAt(cues, outMs);
          if (cue) renderSubtitleToCanvas(octx, cue, job.style, W);
        }

        if (isGif) {
          const px = octx.getImageData(0, 0, W, H).data;
          if (gif) (gif as GifEncoder).addFrame(px, 1000 / fps);
          else {
            gifSamples.push(px);
            if (gifSamples.length >= 8) startGif();
          }
        } else if (videoEncoder) {
          const ts = Math.max(outUs, lastTsUs + 1);
          lastTsUs = ts;
          const vf = new VideoFrame(out, { timestamp: ts, duration: Math.round(frameDurUs) });
          try {
            videoEncoder.encode(vf, { keyFrame: frameIndex % gop === 0 });
          } finally {
            vf.close(); // close 안 하면 몇 초 만에 GPU 메모리가 터진다
          }
          frameIndex++;
        }
      } catch (e) {
        fail(e);
      } finally {
        frame.close();
      }
    };

    videoDecoder = new VideoDecoder({ output: handleFrame, error: fail });
    videoDecoder.configure(v.config);

    // ── 오디오 ────────────────────────────────────────────
    let flushAudio: (() => void) | null = null;
    if (a && audioPlan && muxer) {
      const { enc, outCh } = audioPlan;
      const outRate = enc.config.sampleRate;
      const splicer = new AudioSplicer(msRangesToSamples(ranges, a.sampleRate), outCh, Math.round((a.sampleRate * CROSSFADE_MS) / 1000));
      const resampler = outRate !== a.sampleRate ? new LinearResampler(a.sampleRate, outRate, outCh) : null;
      // 컷을 이어 붙인 시간(배속 전) 기준 배속 구간 — 붙인 순서대로 길이를 누적하면 그대로 나온다
      let acc = 0;
      const cutSpeedSpans = timeMap.spans.map((sp) => {
        const len = sp.sourceEndMs - sp.sourceStartMs;
        const span = { startMs: acc, endMs: acc + len, speed: sp.speed };
        acc += len;
        return span;
      });
      const speeder = hasSpeedChange(cutSpeedSpans, job.globalSpeed ?? 1)
        ? new VariableSpeedResampler(speedSpansToSamples(cutSpeedSpans, a.sampleRate), outCh, job.globalSpeed ?? 1)
        : null;
      const mux = muxer;
      let cursor: number | null = null;
      let emitted = 0;
      const encoder = new AudioEncoder({ output: (chunk, meta) => mux.addAudioChunk(chunk, meta), error: fail });
      encoder.configure(enc.config);
      audioEncoder = encoder;
      const emit = (planes: Float32Array[]) => {
        const sped = speeder ? speeder.process(planes) : planes;
        const p = resampler ? resampler.process(sped) : sped;
        const n = p[0]?.length ?? 0;
        if (n === 0) return;
        // 오디오 타임스탬프는 출력 샘플 수로만 계산 — 영상 싱크의 기준 (GUIDE 7장)
        const data = new AudioData({
          format: 'f32-planar', sampleRate: outRate, numberOfFrames: n, numberOfChannels: outCh,
          timestamp: Math.round((emitted * 1e6) / outRate), data: planarToBuffer(p),
        });
        try {
          encoder.encode(data);
        } finally {
          data.close();
        }
        emitted += n;
      };
      audioDecoder = new AudioDecoder({
        output: (data) => {
          try {
            if (failure) return;
            const n = data.numberOfFrames;
            if (cursor === null) cursor = Math.round((data.timestamp * a.sampleRate) / 1e6);
            const planes = Array.from({ length: outCh }, (_, c) => {
              const arr = new Float32Array(n);
              data.copyTo(arr, { planeIndex: Math.min(c, data.numberOfChannels - 1), format: 'f32-planar' });
              return arr;
            });
            for (const chunk of splicer.push(planes, cursor)) emit(chunk);
            cursor += n;
          } catch (e) {
            fail(e);
          } finally {
            data.close();
          }
        },
        error: fail,
      });
      audioDecoder.configure(a.config);
      flushAudio = () => { for (const chunk of splicer.flush()) emit(chunk); };
    }

    // ── 샘플 공급 (백프레셔) ───────────────────────────────
    const vd = videoDecoder;
    const ad = audioDecoder;
    const waitQueues = async () => {
      while (!failure && (vd.decodeQueueSize > 16 || (videoEncoder?.encodeQueueSize ?? 0) > 30
        || (ad?.decodeQueueSize ?? 0) > 64 || (audioEncoder?.encodeQueueSize ?? 0) > 64)) {
        throwIfAborted(signal);
        await sleep(2);
      }
    };
    const totalMs = Math.max(1, lastEndMs);
    let videoDone = false;
    let audioDone = !ad;
    const trackIds = [v.id, ...(ad && a ? [a.id] : [])];

    await demux.readSamples(trackIds, async (id, samples) => {
      for (const s of samples) {
        if (failure) throw failure;
        throwIfAborted(signal);
        if (id === v.id) {
          if (videoDone || !s.data) continue;
          const tUs = sampleTimeUs(s, v.timing);
          // 마지막 구간 뒤 첫 키프레임에서 멈춘다 (B프레임 재정렬 여유를 1초 둔다)
          if (tUs / 1000 > lastEndMs + 1000 && s.is_sync) { videoDone = true; continue; }
          vd.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: tUs, duration: sampleDurationUs(s, v.timing), data: s.data }));
          onProgress({ phase: 'render', done: Math.min(totalMs, Math.max(0, Math.round(tUs / 1000))), total: totalMs });
        } else if (a && ad) {
          if (audioDone || !s.data) continue;
          const tUs = sampleTimeUs(s, a.timing);
          if (tUs / 1000 > lastEndMs + 500) { audioDone = true; continue; }
          ad.decode(new EncodedAudioChunk({ type: 'key', timestamp: tUs, duration: sampleDurationUs(s, a.timing), data: s.data }));
        }
        await waitQueues();
      }
      return !(videoDone && audioDone);
    }, signal);

    await vd.flush();
    if (ad) await ad.flush();
    flushAudio?.();
    if (failure) throw failure;
    throwIfAborted(signal);
    onProgress({ phase: 'mux', done: 0, total: 1 });

    if (isGif) {
      startGif();
      const encoder = gif as GifEncoder | null;
      if (!encoder) throw new AppError('ENCODE_FAILED', '내보낼 프레임이 없습니다.', '구간을 확인해 주세요.');
      const bytes = encoder.finish();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return { buffer, bytes: buffer.byteLength, mime: 'image/gif' };
    }

    await videoEncoder!.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (failure) throw failure;
    muxer!.finalize();
    onProgress({ phase: 'mux', done: 1, total: 1 });

    if (sync) {
      sync.flush();
      const size = (sync as SyncHandle & { getSize(): number }).getSize();
      return { path: outPath, bytes: size, mime: 'video/mp4' };
    }
    const buffer = bufferTarget!.buffer;
    return { buffer, bytes: buffer.byteLength, mime: 'video/mp4' };
  } catch (e) {
    throw toAppError(e, 'ENCODE_FAILED');
  } finally {
    closeQuietly(videoDecoder);
    closeQuietly(videoEncoder);
    closeQuietly(audioDecoder);
    closeQuietly(audioEncoder);
    try { sync?.close(); } catch { /* 이미 닫힘 */ }
  }
}
