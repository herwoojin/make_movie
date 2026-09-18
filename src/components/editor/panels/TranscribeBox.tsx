'use client';

import { Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { StageProgress } from '@/components/common/StageProgress';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Label, NativeSelect } from '@/components/ui/misc';
import { transcribeProject } from '@/lib/editor/transcribe';
import { sttStage, type StageDef, type StageRun } from '@/lib/progress/stages';
import { settings, type SttEnginePreference } from '@/lib/settings';
import { saveTranscript } from '@/lib/storage/projectRepo';
import { STT_ENGINES } from '@/lib/stt/types';
import type { Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { ByokNoticeDialog } from './ByokNoticeDialog';

const LANGS: [string, string][] = [['ko', '한국어'], ['en', '영어'], ['ja', '일본어'], ['zh', '중국어']];

/** 자막 만들기 단계 — 무게는 대략 걸리는 시간 비율 */
const STAGES: StageDef[] = [
  { id: 'audio', label: '영상에서 소리 꺼내기', weight: 8 },
  { id: 'model', label: '음성 인식 모델 준비 (처음 한 번만)', weight: 20 },
  { id: 'transcribe', label: '음성을 글자로 바꾸기', weight: 68 },
  { id: 'save', label: '자막 클립 만들기', weight: 4 },
];

export function TranscribeBox() {
  const hasAudio = useProjectStore((s) => s.asset?.audioCodec !== 'none' && s.peaks !== null);
  const clipCount = useProjectStore((s) => s.doc.clips.length);
  const [engine, setEngine] = useState<SttEnginePreference>('local-whisper');
  const [language, setLanguage] = useState('ko');
  const [busy, setBusy] = useState<{ run: StageRun | null; startedAt: number; done: boolean } | null>(null);
  const [notice, setNotice] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => setEngine(settings.getSttEngine()), []);

  const run = async () => {
    const { project, asset, source } = useProjectStore.getState();
    if (!project || !asset || !source) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    let sawDownload = false;
    const step = (next: StageRun) => setBusy((b) => (b ? { ...b, run: next } : b));
    setBusy({ run: { stageId: 'audio', ratio: 0, message: '준비 중' }, startedAt, done: false });
    useUiStore.getState().setStatus({ kind: 'busy', text: '음성을 글자로 바꾸는 중…', startedAt });
    try {
      const onProgress = (p: WorkerProgress) => {
        const next = sttStage(p);
        if (next.stageId === 'model') sawDownload = true;
        // 모델을 이미 받아 뒀으면 그 단계는 "이미 준비됨"
        step({ ...next, skipped: next.stageId === 'transcribe' && !sawDownload ? ['model'] : undefined });
      };
      const result = await transcribeProject({ project, asset, source, engine, language, signal: ctrl.signal, onProgress });
      const skipped = sawDownload ? undefined : ['model'];
      step({ stageId: 'save', ratio: 0.5, message: `단어 ${result.words.length}개로 자막 클립을 만드는 중`, skipped });
      const { transcript, words } = await saveTranscript(project.id, engine, result.language, result.words, settings.getFillers());
      useProjectStore.getState().replaceTranscript(transcript, words, { label: '자막 자동 생성' });
      const count = useProjectStore.getState().doc.clips.length;

      // 100%를 잠깐 보여 준 뒤 닫는다
      setBusy((b) => (b ? { ...b, run: { stageId: 'save', ratio: 1, skipped }, done: true } : b));
      setTimeout(() => setBusy((b) => (b?.done ? null : b)), 1500);
      useUiStore.getState().toast({
        kind: 'success',
        title: words.length ? `자막 클립 ${count}개를 만들었습니다.` : '말소리를 찾지 못했습니다.',
        hint: words.length ? '가운데 목록에서 지우고 싶은 단어의 ⊗를 누르면 영상에서 바로 빠집니다.' : '언어 설정을 확인하거나 다른 엔진을 써 보세요.',
      });
      useUiStore.getState().setStatus({ kind: 'done', text: `자막 클립 ${count}개를 만들었습니다.` });
    } catch (e) {
      useUiStore.getState().showError(e);
      setBusy(null);
    }
  };

  const meta = STT_ENGINES[engine];
  const running = !!busy && !busy.done;

  return (
    <Section title="자막 만들기" description="음성을 글자로 바꿔 문장 단위 자막을 만듭니다.">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="stt-engine-panel" className="text-xs">엔진</Label>
          <NativeSelect id="stt-engine-panel" className="h-9" value={engine} disabled={running} onChange={(e) => setEngine(e.target.value as SttEnginePreference)}>
            {Object.values(STT_ENGINES).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="stt-lang" className="text-xs">말하는 언어</Label>
          <NativeSelect id="stt-lang" className="h-9" value={language} disabled={running} onChange={(e) => setLanguage(e.target.value)}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>
      {clipCount > 0 && !busy && <p className="text-xs text-amber-300">지금 있는 클립과 지운 단어는 새로 만든 것으로 바뀝니다. (Ctrl+Z로 되돌릴 수 있음)</p>}
      {busy ? (
        <StageProgress
          title="자막 만들기"
          stages={STAGES}
          run={busy.run}
          startedAt={busy.startedAt}
          done={busy.done}
          onCancel={() => abortRef.current?.abort()}
        />
      ) : (
        <Button onClick={() => (meta.sendsAudioToServer ? setNotice(true) : void run())} disabled={!hasAudio}>
          <Mic /> 자막 만들기
        </Button>
      )}
      {!hasAudio && <p className="text-xs text-muted-foreground">소리 분석이 끝나야 자막을 만들 수 있습니다.</p>}
      <ByokNoticeDialog open={notice} provider={meta.providerName ?? '외부'} onCancel={() => setNotice(false)} onConfirm={() => { setNotice(false); void run(); }} />
    </Section>
  );
}
