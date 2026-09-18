'use client';

// 내 목소리 TTS (F-08).
// 감정은 프롬프트가 아니라 "그 감정으로 녹음해 둔 참조 샘플"이다 — 슬롯에 등록해 두고 골라 쓴다.
import { Download, Mic, Play, RefreshCw, Square, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { VoiceEmotion, VoiceProfile } from '@/types/models';
import { ElapsedTimer } from '@/components/common/ElapsedTimer';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Label, NativeSelect, Progress } from '@/components/ui/misc';
import { formatDuration } from '@/lib/core/timecode';
import { sidecar } from '@/lib/sidecar/client';
import { useSidecar } from '@/lib/sidecar/useSidecar';
import { saveAndRecord } from '@/lib/storage/savedResults';
import {
  DEFAULT_REF_TEXT, deleteVoiceProfile, EMOTIONS, emotionLabel, listVoiceProfiles, readVoiceProfile, saveVoiceProfile,
} from '@/lib/tts/voiceProfiles';
import { listMicrophones, requestMicPermission, toMonoWav, VoiceRecorder, type MicDevice } from '@/lib/tts/record';
import { cn, downloadBlob } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function TtsView() {
  const { ready, features, health } = useSidecar();
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [emotion, setEmotion] = useState<VoiceEmotion>('default');
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [refText, setRefText] = useState(DEFAULT_REF_TEXT);
  const [recording, setRecording] = useState(false);
  const [sample, setSample] = useState<{ wav: Blob; durationMs: number; url: string } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ message: string; startedAt: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const recorderRef = useRef(new VoiceRecorder());
  const abortRef = useRef<AbortController | null>(null);

  const canClone = ready && features.tts;
  const current = profiles.find((p) => p.emotion === emotion);

  const refresh = () => { listVoiceProfiles().then(setProfiles).catch(() => setProfiles([])); };
  useEffect(() => {
    refresh();
    listMicrophones().then(setDevices).catch(() => setDevices([]));
  }, []);
  useEffect(() => () => {
    if (sample) URL.revokeObjectURL(sample.url);
    if (result) URL.revokeObjectURL(result.url);
  }, [sample, result]);

  const refreshDevices = async () => {
    try {
      // 권한을 받아야 장치 이름이 보인다
      const stream = await requestMicPermission();
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      useUiStore.getState().showError(e);
    }
    setDevices(await listMicrophones());
  };

  const toggleRecord = async () => {
    try {
      if (recording) {
        const { wav, durationMs } = await recorderRef.current.stop();
        setRecording(false);
        setSample({ wav, durationMs, url: URL.createObjectURL(wav) });
        return;
      }
      await recorderRef.current.start(deviceId || undefined);
      setRecording(true);
    } catch (e) {
      setRecording(false);
      useUiStore.getState().showError(e);
    }
  };

  const pickFile = async (file: File) => {
    try {
      const { wav, durationMs } = await toMonoWav(file);
      setSample({ wav, durationMs, url: URL.createObjectURL(wav) });
    } catch {
      useUiStore.getState().toast({ kind: 'error', title: '소리 파일을 읽지 못했습니다.', hint: 'WAV·MP3·M4A 파일인지 확인해 주세요.' });
    }
  };

  const register = async () => {
    if (!sample) return;
    await saveVoiceProfile(emotion, sample.wav, refText, sample.durationMs, 48_000);
    refresh();
    useUiStore.getState().toast({ kind: 'success', title: `“${emotionLabel(emotion)}” 참조 음성을 등록했습니다.` });
  };

  const remove = async () => {
    await deleteVoiceProfile(emotion);
    refresh();
  };

  const generate = async () => {
    if (!text.trim()) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setBusy({ message: '음성을 만드는 중', startedAt });
    useUiStore.getState().setStatus({ kind: 'busy', text: '내 목소리로 음성을 만드는 중…', startedAt });
    try {
      if (canClone) {
        // 참조 음성을 도우미에게 넘긴 뒤 그 말투로 만든다
        let refAudioPath: string | undefined;
        if (current) {
          const file = await readVoiceProfile(current);
          if (file) refAudioPath = await sidecar.saveFile(file, `ref-${current.emotion}.wav`);
        }
        const { wavPath } = await sidecar.generateTts(
          { text, refAudioPath, refText: current?.refText, emotion },
          (_d, _t, message) => setBusy({ message: message ?? '음성을 만드는 중', startedAt }),
          ctrl.signal,
        );
        const file = await sidecar.readFile(wavPath);
        setResult({ blob: file, url: URL.createObjectURL(file) });
        await saveAndRecord({ blob: file, fileName: file.name, kind: 'audio', toolId: 'tts' });
      } else {
        // 도우미가 없으면 브라우저 기본 음성으로만 만들 수 있다 (목소리 복제 아님)
        speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ko-KR';
        speechSynthesis.speak(utter);
        useUiStore.getState().toast({
          kind: 'info',
          title: '브라우저 기본 음성으로 읽었습니다.',
          hint: '내 목소리 복제는 내 컴퓨터 도우미(로컬 TTS)가 있어야 합니다. 이 소리는 파일로 저장되지 않습니다.',
        });
      }
      useUiStore.getState().setStatus({ kind: 'done', text: '음성을 만들었습니다.' });
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
          <Volume2 className="h-3.5 w-3.5" /> AI 음성
        </p>
        <h1 className="mt-1 text-2xl font-bold">내 목소리 TTS</h1>
        <p className="text-sm text-muted-foreground">
          {canClone
            ? `내 컴퓨터에서 처리합니다${health?.models?.tts?.[0] ? ` · ${health.models.tts[0]}` : ''}. 녹음과 글자는 인터넷으로 나가지 않습니다.`
            : '내 목소리 복제는 내 컴퓨터 도우미 설치가 필요합니다. 지금은 브라우저 기본 음성으로만 읽어볼 수 있어요.'}
        </p>
      </header>

      <Section title="참조 음성 녹음" description="아래 문장을 평소 대화하듯 읽어 주세요. 48kHz · 16bit · 모노로 저장됩니다.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="mic" className="text-xs">마이크</Label>
            <NativeSelect id="mic" className="h-9" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">기본 마이크</option>
              {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
            </NativeSelect>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refreshDevices()} aria-label="마이크 목록 새로고침"><RefreshCw /></Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={recording ? 'destructive' : 'default'} onClick={() => void toggleRecord()}>
            {recording ? <><Square /> 녹음 멈추기</> : <><Mic /> 녹음 시작</>}
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">
            음성 파일
            <input type="file" accept="audio/*,.wav,.mp3,.m4a" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); }} />
          </label>
          {sample && <audio src={sample.url} controls className="h-9" aria-label="녹음 들어보기" />}
        </div>
        {sample && <p className="text-xs text-muted-foreground">녹음 완료 · {formatDuration(sample.durationMs)} · 48kHz / 16bit / 모노</p>}

        <div className="space-y-1">
          <Label htmlFor="ref-text" className="text-xs">녹음한 문장의 원문</Label>
          <textarea id="ref-text" value={refText} onChange={(e) => setRefText(e.target.value)} rows={3}
            className="w-full rounded-md border bg-transparent p-2 text-sm focus:border-primary focus:outline-none" />
        </div>
      </Section>

      <Section title="감정 참조" description="감정은 글로 지시하지 않습니다. 그 감정으로 녹음한 샘플을 슬롯에 등록해 두고 고릅니다.">
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONS.map((e) => {
            const has = profiles.some((p) => p.emotion === e.id);
            return (
              <button key={e.id} type="button" role="radio" aria-checked={emotion === e.id} onClick={() => setEmotion(e.id)}
                className={cn('rounded-full border px-3 py-1 text-xs',
                  emotion === e.id ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
                  has && 'font-medium')}>
                {e.label}{has ? ' ●' : ''}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={!sample} onClick={() => void register()}>참조 등록</Button>
          {current && <Button size="sm" variant="ghost" onClick={() => void remove()}><Trash2 /> 이 감정 지우기</Button>}
          <span className="text-xs text-muted-foreground">
            {current ? `등록됨 · ${formatDuration(current.durationMs)}` : '아직 등록된 샘플이 없습니다'}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">감정 프롬프트 미지원 · 선택한 녹음의 말투를 참조합니다.</p>
      </Section>

      <Section title="읽을 문장">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="읽을 문장"
          placeholder="여기에 영상에 넣을 나레이션을 적어 주세요."
          className="w-full rounded-md border bg-transparent p-2 text-sm focus:border-primary focus:outline-none" />
        {busy ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-sm">{busy.message}</p>
            <Progress value={undefined} aria-label="음성 만들기 진행률" />
            <div className="flex items-center justify-between">
              <ElapsedTimer startedAt={busy.startedAt} className="text-xs tabular-nums text-muted-foreground" />
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}><X /> 취소</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={!text.trim()} onClick={() => void generate()}>
              <Play /> {canClone ? '내 목소리로 생성' : '브라우저 기본 음성으로 읽기'}
            </Button>
            {result && (
              <>
                <audio src={result.url} controls className="h-9" aria-label="결과 들어보기" />
                <Button variant="secondary" onClick={() => downloadBlob(result.blob, 'tts.wav')}><Download /> WAV 받기</Button>
              </>
            )}
          </div>
        )}
        {!canClone && (
          <p className="text-xs text-amber-300">
            브라우저 기본 음성은 시스템에 설치된 목소리로 읽어 줄 뿐, 내 목소리를 복제하지 않고 파일로도 저장되지 않습니다.
          </p>
        )}
      </Section>
    </div>
  );
}
