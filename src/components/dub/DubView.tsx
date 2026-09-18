'use client';

// 영상에 소리 입히기 (F-06). 브라우저에서 소리만 합치고, 영상은 다시 압축하지 않는다.
import { Download, Music, Play, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ElapsedTimer } from '@/components/common/ElapsedTimer';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { Label, Progress, Switch } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { formatDuration } from '@/lib/core/timecode';
import { ACCEPT_VIDEO } from '@/lib/editor/importPipeline';
import { replaceAudioTrack } from '@/lib/encode/remuxAudio';
import { audioBufferToWav, DEFAULT_MIX, mixAudio, type BaseAudioMode } from '@/lib/audio/mix';
import { probeMedia } from '@/lib/media/probeClient';
import { saveAndRecord } from '@/lib/storage/savedResults';
import { baseName, downloadBlob, formatBytes } from '@/lib/utils';
import { progressRatio, type Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useUiStore } from '@/store/uiStore';
import { WaveformPair } from './WaveformPair';

async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

export function DubView() {
  const [video, setVideo] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<{ durationMs: number; hasAudio: boolean } | null>(null);
  const [baseBuffer, setBaseBuffer] = useState<AudioBuffer | null>(null);
  const [overlay, setOverlay] = useState<{ file: File; buffer: AudioBuffer } | null>(null);
  const [mode, setMode] = useState<BaseAudioMode>(DEFAULT_MIX.mode);
  const [baseVolume, setBaseVolume] = useState(DEFAULT_MIX.baseVolume * 100);
  const [overlayVolume, setOverlayVolume] = useState(DEFAULT_MIX.overlayVolume * 100);
  const [offsetMs, setOffsetMs] = useState(0);
  const [fadeIn, setFadeIn] = useState(DEFAULT_MIX.fadeInMs);
  const [fadeOut, setFadeOut] = useState(DEFAULT_MIX.fadeOutMs);
  const [ducking, setDucking] = useState(DEFAULT_MIX.ducking);
  const [preview, setPreview] = useState<{ url: string; playing: boolean } | null>(null);
  const [busy, setBusy] = useState<{ label: string; ratio: number; startedAt: number } | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const pickVideo = async (file: File) => {
    setVideo(file);
    setResult(null);
    try {
      const probe = await probeMedia(file);
      setVideoInfo({ durationMs: probe.durationMs, hasAudio: probe.hasAudio });
      setBaseBuffer(probe.hasAudio ? await decodeFile(file).catch(() => null) : null);
    } catch (e) {
      useUiStore.getState().showError(e);
    }
  };

  const pickAudio = async (file: File) => {
    try {
      setOverlay({ file, buffer: await decodeFile(file) });
      setResult(null);
    } catch {
      useUiStore.getState().toast({ kind: 'error', title: '소리 파일을 읽지 못했습니다.', hint: 'MP3·WAV·M4A 파일인지 확인해 주세요.' });
    }
  };

  const options = {
    mode, baseVolume: baseVolume / 100, overlayVolume: overlayVolume / 100,
    offsetMs, fadeInMs: fadeIn, fadeOutMs: fadeOut, ducking,
  };

  const buildMix = async (): Promise<Blob | null> => {
    if (!overlay || !videoInfo) return null;
    const mixed = await mixAudio({ base: baseBuffer, overlay: overlay.buffer, durationMs: videoInfo.durationMs }, options);
    return audioBufferToWav(mixed);
  };

  const listen = async () => {
    if (preview?.playing) {
      audioRef.current?.pause();
      setPreview((p) => (p ? { ...p, playing: false } : p));
      return;
    }
    const wav = await buildMix();
    if (!wav) return;
    if (preview) URL.revokeObjectURL(preview.url);
    const url = URL.createObjectURL(wav);
    setPreview({ url, playing: true });
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    el.src = url;
    el.onended = () => setPreview((p) => (p ? { ...p, playing: false } : p));
    void el.play();
  };

  const render = async () => {
    if (!video || !videoInfo || !overlay) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setBusy({ label: '소리 합치는 중', ratio: 0.1, startedAt });
    useUiStore.getState().setStatus({ kind: 'busy', text: '영상에 소리를 입히는 중…', startedAt });
    try {
      const wav = await buildMix();
      if (!wav) return;
      setBusy({ label: '영상에 소리 넣는 중 (영상은 다시 압축하지 않습니다)', ratio: 0.3, startedAt });
      const onProgress = (p: WorkerProgress) => setBusy({ label: '영상에 소리 넣는 중', ratio: 0.3 + progressRatio(p) * 0.7, startedAt });
      const out = await replaceAudioTrack(video, wav, videoInfo.durationMs, onProgress, ctrl.signal);
      setResult(out);
      const fileName = `${baseName(video.name)}_더빙.mp4`;
      const { outcome } = await saveAndRecord({ blob: out, fileName, kind: 'video', toolId: 'dub', durationMs: videoInfo.durationMs });
      useUiStore.getState().setStatus({ kind: 'done', text: `저장 완료 · ${outcome.location}` });
      useUiStore.getState().toast({ kind: 'success', title: '소리를 입힌 영상을 저장했습니다.', hint: `${formatBytes(out.size)} · 최근 저장 결과에서 다시 받을 수 있습니다.` });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <header>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Music className="h-3.5 w-3.5" /> 소리 입히기
        </p>
        <h1 className="mt-1 text-2xl font-bold">영상에 소리 입히기</h1>
        <p className="text-sm text-muted-foreground">
          나레이션이나 배경음악을 얹습니다. 영상은 그대로 두고 소리만 갈아 끼우기 때문에 화질이 떨어지지 않습니다.
        </p>
      </header>

      <Section title="파일 고르기">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">
            영상 선택
            <input type="file" accept={ACCEPT_VIDEO} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickVideo(f); }} />
          </label>
          <span className="truncate text-sm text-muted-foreground">
            {video ? `${video.name}${videoInfo ? ` · ${formatDuration(videoInfo.durationMs)}${videoInfo.hasAudio ? '' : ' · 소리 없음'}` : ''}` : '선택된 영상이 없습니다'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">
            소리 선택
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAudio(f); }} />
          </label>
          <span className="truncate text-sm text-muted-foreground">
            {overlay ? `${overlay.file.name} · ${formatDuration(overlay.buffer.duration * 1000)}` : '선택된 소리가 없습니다'}
          </span>
        </div>
      </Section>

      {overlay && videoInfo && (
        <>
          <Section title="싱크 맞추기" description="위는 영상의 원래 소리, 아래는 새로 얹는 소리입니다. 숫자를 바꾸면 얹는 소리가 앞뒤로 움직입니다.">
            <WaveformPair base={baseBuffer} overlay={overlay.buffer} durationMs={videoInfo.durationMs} offsetMs={offsetMs} />
            <SliderField label="시작 위치" value={offsetMs} min={-5000} max={10_000} step={50}
              format={(v) => `${(v / 1000).toFixed(2)}초`} onChange={setOffsetMs} />
          </Section>

          <Section title="원래 소리">
            <Segmented label="처리 방식" value={mode}
              options={[['replace', '완전 교체'], ['keep', '배경으로 남기기']] as [BaseAudioMode, string][]}
              onChange={(v) => setMode(v)} />
            {mode === 'keep' && (
              <>
                <SliderField label="원래 소리 볼륨" value={baseVolume} min={0} max={100} format={(v) => `${v}%`} onChange={setBaseVolume} />
                <label className="flex items-center justify-between text-sm">
                  말할 때 배경 자동으로 줄이기
                  <Switch checked={ducking} onCheckedChange={setDucking} aria-label="자동 더킹" />
                </label>
                <p className="text-xs text-muted-foreground">얹는 소리에서 말소리가 들리는 동안 원래 소리를 12dB 낮춥니다.</p>
              </>
            )}
            {!videoInfo.hasAudio && <p className="text-xs text-muted-foreground">이 영상에는 원래 소리가 없습니다.</p>}
          </Section>

          <Section title="얹는 소리">
            <SliderField label="볼륨" value={overlayVolume} min={0} max={150} format={(v) => `${v}%`} onChange={setOverlayVolume} />
            <SliderField label="페이드 인" value={fadeIn} min={0} max={3000} step={50} format={(v) => `${(v / 1000).toFixed(2)}초`} onChange={setFadeIn} />
            <SliderField label="페이드 아웃" value={fadeOut} min={0} max={5000} step={50} format={(v) => `${(v / 1000).toFixed(2)}초`} onChange={setFadeOut} />
          </Section>

          {busy ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <p className="text-sm">{busy.label}</p>
              <Progress value={busy.ratio * 100} aria-label="소리 입히기 진행률" />
              <div className="flex items-center justify-between">
                <ElapsedTimer startedAt={busy.startedAt} className="text-xs tabular-nums text-muted-foreground" />
                <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}><X /> 취소</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void listen()}>
                {preview?.playing ? <><Square /> 멈추기</> : <><Play /> 합친 소리 들어보기</>}
              </Button>
              <Button onClick={() => void render()}><Download /> 소리 입힌 영상 저장</Button>
              {result && (
                <Button variant="outline" onClick={() => downloadBlob(result, `${baseName(video?.name ?? '영상')}_더빙.mp4`)}>
                  <Download /> 다시 받기 ({formatBytes(result.size)})
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        <Label className="text-xs">내 목소리 TTS</Label>에서 만든 소리도 파일로 저장한 뒤 여기서 불러오면 그대로 얹을 수 있습니다.
      </p>
    </div>
  );
}
