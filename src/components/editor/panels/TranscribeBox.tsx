'use client';

import { Loader2, Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Label, NativeSelect, Progress } from '@/components/ui/misc';
import { transcribeProject } from '@/lib/editor/transcribe';
import { settings, type SttEnginePreference } from '@/lib/settings';
import { saveTranscript } from '@/lib/storage/projectRepo';
import { STT_ENGINES } from '@/lib/stt/types';
import { renumberCues, wordsToCues } from '@/lib/subtitle/model';
import type { Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { ByokNoticeDialog } from './ByokNoticeDialog';

const LANGS: [string, string][] = [['ko', '한국어'], ['en', '영어'], ['ja', '일본어'], ['zh', '중국어']];

function describe(p: WorkerProgress): { text: string; pct: number } {
  if (p.phase === 'download') {
    return { text: `음성 인식 파일 내려받는 중 (처음 한 번만) ${(p.done / 1e6).toFixed(0)}MB / ${(p.total / 1e6).toFixed(0)}MB`, pct: p.total ? (p.done / p.total) * 100 : 0 };
  }
  if (p.phase === 'transcribe') return { text: `음성을 글자로 바꾸는 중 ${Math.round((p.done / p.total) * 100)}%`, pct: (p.done / p.total) * 100 };
  return { text: p.message ?? '준비 중', pct: 1 };
}

export function TranscribeBox() {
  const hasAudio = useProjectStore((s) => s.asset?.audioCodec !== 'none' && s.peaks !== null);
  const cueCount = useProjectStore((s) => s.doc.cues.length);
  const [engine, setEngine] = useState<SttEnginePreference>('local-whisper');
  const [language, setLanguage] = useState('ko');
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [notice, setNotice] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => setEngine(settings.getSttEngine()), []);

  const run = async () => {
    const { project, asset, source } = useProjectStore.getState();
    if (!project || !asset || !source) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ phase: 'analyze', done: 0, total: 1, message: '준비 중' });
    try {
      const result = await transcribeProject({ project, asset, source, engine, language, signal: ctrl.signal, onProgress: setProgress });
      const { transcript, words } = await saveTranscript(project.id, engine, result.language, result.words, settings.getFillers());
      useProjectStore.getState().setTranscript(transcript, words);
      const { doc } = useProjectStore.getState();
      const cues = wordsToCues(words, { projectId: project.id, maxCharsPerLine: doc.style.maxCharsPerLine, maxLines: doc.style.maxLines, edl: doc.edl });
      useProjectStore.getState().edit('자막 자동 생성', (d) => {
        // 잠근 자막은 사용자가 손본 것이므로 보존하고, 그 자리와 겹치는 새 자막은 넣지 않는다
        const locked = d.cues.filter((c) => c.locked);
        const fresh = cues.filter((c) => !locked.some((l) => c.sourceStartMs < l.sourceEndMs && c.sourceEndMs > l.sourceStartMs));
        d.cues = renumberCues([...locked, ...fresh]);
      });
      useUiStore.getState().toast({
        kind: 'success',
        title: words.length ? `자막 ${cues.length}개를 만들었습니다.` : '말소리를 찾지 못했습니다.',
        hint: words.length ? '1단계에서 틀린 글자를 고치고, 자동 컷 패널에서 추임새도 찾아보세요.' : '언어 설정을 확인하거나 다른 엔진을 써 보세요.',
      });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setProgress(null);
    }
  };

  const meta = STT_ENGINES[engine];
  const d = progress ? describe(progress) : null;

  return (
    <Section title="자막 만들기" description="음성을 글자로 바꿔 문장 단위 자막을 만듭니다.">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="stt-engine-panel" className="text-xs">엔진</Label>
          <NativeSelect id="stt-engine-panel" className="h-9" value={engine} disabled={!!progress} onChange={(e) => setEngine(e.target.value as SttEnginePreference)}>
            {Object.values(STT_ENGINES).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="stt-lang" className="text-xs">말하는 언어</Label>
          <NativeSelect id="stt-lang" className="h-9" value={language} disabled={!!progress} onChange={(e) => setLanguage(e.target.value)}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>
      {cueCount > 0 && !progress && <p className="text-xs text-amber-300">이미 있는 자막 중 잠그지 않은 것은 새로 만든 자막으로 바뀝니다. (Ctrl+Z로 되돌릴 수 있음)</p>}
      {progress && d ? (
        <div className="space-y-2" role="status">
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {d.text}</p>
          <Progress value={d.pct} aria-label="자막 생성 진행률" />
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>취소</Button>
        </div>
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
