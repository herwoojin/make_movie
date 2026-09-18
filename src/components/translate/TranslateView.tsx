'use client';

// 1단계 · 해외 영상 한국어 자막 (F-07).
// 영상 → 원어 자막(Whisper) → 한국어 번역(BYOK/내 컴퓨터) → 표에서 손보기 → 2단계로 인계.
import { ArrowRight, Download, Languages, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { TranslatedCue } from '@/lib/translate';
import { StageProgress } from '@/components/common/StageProgress';
import { ByokNoticeDialog } from '@/components/editor/panels/ByokNoticeDialog';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label, NativeSelect } from '@/components/ui/misc';
import { buildClipsFromWords, renumberClips } from '@/lib/core/clips';
import { formatShort } from '@/lib/core/timecode';
import { ACCEPT_VIDEO, createProjectFromFile } from '@/lib/editor/importPipeline';
import { transcribeProject } from '@/lib/editor/transcribe';
import { toAppError } from '@/lib/errors';
import { useSidecar } from '@/lib/sidecar/useSidecar';
import { settings } from '@/lib/settings';
import { WHISPER_MODELS, type WhisperSize } from '@/lib/stt/localWhisper';
import { getDb } from '@/lib/storage/db';
import { loadProjectBundle, saveProjectDoc, saveTranscript, setPipelineStage } from '@/lib/storage/projectRepo';
import { createHistory } from '@/lib/core/undo';
import { MODE_LABELS, TONE_LABELS, TRANSLATE_ENGINES, parseGlossary, runTranslate, type TranslateEngineId, type TranslateMode, type TranslateTone } from '@/lib/translate';
import { sttStage, type StageDef, type StageRun } from '@/lib/progress/stages';
import { cn } from '@/lib/utils';
import type { Progress as WorkerProgress } from '@/lib/worker/protocol';
import { useUiStore } from '@/store/uiStore';

const LANGS: [string, string][] = [['auto', '자동 감지'], ['en', '영어'], ['ja', '일본어'], ['zh', '중국어'], ['ko', '한국어']];

/** 해외 영상 자막 만들기 단계 — 무게는 대략 걸리는 시간 비율 */
const STAGES: StageDef[] = [
  { id: 'load', label: '영상 불러오기', weight: 8 },
  { id: 'audio', label: '영상에서 소리 꺼내기', weight: 7 },
  { id: 'model', label: '음성 인식 모델 준비 (처음 한 번만)', weight: 15 },
  { id: 'transcribe', label: '원어 자막 만들기', weight: 40 },
  { id: 'translate', label: '한국어로 번역', weight: 28 },
  { id: 'save', label: '저장', weight: 2 },
];

interface Job {
  projectId: string;
  fileName: string;
  rows: TranslatedCue[];
}

export function TranslateView() {
  const router = useRouter();
  const { ready: sidecarReady, features } = useSidecar();
  const [engine, setEngine] = useState<TranslateEngineId>('gemini');
  const [sourceLang, setSourceLang] = useState('auto');
  const [whisper, setWhisper] = useState<WhisperSize>('base');
  const [tone, setTone] = useState<TranslateTone>('literal');
  const [mode, setMode] = useState<TranslateMode>('precise');
  const [glossaryText, setGlossaryText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState<{ run: StageRun | null; startedAt: number; done: boolean } | null>(null);
  const [notice, setNotice] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setEngine(settings.getTranslateEngine());
    setGlossaryText(settings.getGlossaryText());
  }, []);

  const meta = TRANSLATE_ENGINES[engine];

  const run = async () => {
    if (!file) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    // 모델을 내려받은 적이 있는지 — 이미 받아 뒀으면 그 단계는 "이미 준비됨"으로 보인다
    let sawDownload = false;
    const step = (next: StageRun) => setBusy((b) => (b ? { ...b, run: next } : b));
    setBusy({ run: { stageId: 'load', ratio: 0, message: '준비 중' }, startedAt, done: false });
    useUiStore.getState().setStatus({ kind: 'busy', text: '해외 영상 한국어 자막을 만드는 중…', startedAt });
    try {
      // ① 프로젝트로 들여오기 (원본은 이 컴퓨터 안에만 있다)
      const { projectId } = await createProjectFromFile(file, (p) => step({ stageId: 'load', ratio: p.ratio, message: p.label }), ctrl.signal, {
        sourceTool: 'translate', pipelineStage: 1,
      });
      const bundle = await loadProjectBundle(projectId);

      // ② 원어 자막 만들기 — 구간마다 방금 알아들은 말을 보여 준다
      const onStt = (p: WorkerProgress) => {
        const next = sttStage(p);
        if (next.stageId === 'model') sawDownload = true;
        step({ ...next, skipped: next.stageId === 'transcribe' && !sawDownload ? ['model'] : undefined });
      };
      const stt = await transcribeProject({
        project: bundle.project, asset: bundle.asset, source: file, engine: 'local-whisper',
        // "자동 감지"는 언어를 지정하지 않아야 Whisper가 스스로 알아낸다
        language: sourceLang,
        model: WHISPER_MODELS[whisper].repo, onProgress: onStt, signal: ctrl.signal,
      });
      const { transcript, words } = await saveTranscript(projectId, 'local-whisper', stt.language, stt.words, settings.getFillers());
      const built = buildClipsFromWords(words, { projectId, sourceKind: 'source-audio' });

      if (built.clips.length === 0) {
        useUiStore.getState().toast({ kind: 'error', title: '말소리를 찾지 못했습니다.', hint: '인식 언어를 지정하거나 다른 영상으로 시도해 주세요.' });
        setBusy(null);
        return;
      }

      // ③ 번역 — 묶음마다 방금 번역한 문장을 보여 준다
      const skipped = sawDownload ? undefined : ['model'];
      step({ stageId: 'translate', ratio: 0, message: `자막 ${built.clips.length}줄 번역 준비`, skipped });
      const cues = built.clips.map((c) => ({ start: c.sourceStartMs, end: c.sourceEndMs, text: c.captionTextOriginal }));
      const rows = await runTranslate({
        engine,
        cues,
        sourceLang,
        tone,
        mode,
        glossary: parseGlossary(glossaryText),
        signal: ctrl.signal,
        onProgress: (done, total, message, preview) => step({
          stageId: 'translate',
          ratio: total ? done / total : 0,
          message: message ?? '번역하는 중',
          detail: { chunk: done, chunks: total, text: preview },
          skipped,
        }),
      });

      // ④ 클립에 원어·한국어를 함께 담아 저장 (2단계에서 바로 쓴다)
      step({ stageId: 'save', ratio: 0.5, message: '프로젝트에 저장하는 중', skipped });
      const clips = renumberClips(built.clips.map((c, i) => ({ ...c, translatedText: rows[i]?.translated ?? '' })));
      await saveProjectDoc(bundle.project, { ...bundle.doc, clips, words: built.words }, [], createHistory());
      await getDb().transcripts.update(transcript.id, { language: stt.language });

      // 100%를 잠깐 보여 준 뒤 결과 표로 넘어간다
      setBusy((b) => (b ? { ...b, run: { stageId: 'save', ratio: 1, skipped }, done: true } : b));
      setJob({ projectId, fileName: file.name, rows });
      useUiStore.getState().setStatus({ kind: 'done', text: `한국어 자막 ${rows.length}줄을 만들었습니다.` });
      setTimeout(() => setBusy((b) => (b?.done ? null : b)), 1500);
    } catch (e) {
      useUiStore.getState().showError(toAppError(e));
      setBusy(null);
    }
  };

  const editRow = (index: number, translated: string) => {
    setJob((j) => (j ? { ...j, rows: j.rows.map((r, i) => (i === index ? { ...r, translated } : r)) } : j));
  };

  /** 표에서 고친 번역을 프로젝트에 반영하고 2단계로 */
  const sendToStageTwo = async () => {
    if (!job) return;
    const bundle = await loadProjectBundle(job.projectId);
    const clips = bundle.doc.clips.map((c, i) => ({ ...c, translatedText: job.rows[i]?.translated ?? c.translatedText }));
    await saveProjectDoc(bundle.project, { ...bundle.doc, clips }, bundle.suggestions, createHistory());
    await setPipelineStage(job.projectId, 2);
    router.push(`/editor/${job.projectId}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            <Languages className="h-3.5 w-3.5" /> 1단계
          </p>
          <h1 className="mt-1 text-2xl font-bold">해외 영상 한국어 자막</h1>
          <p className="text-sm text-muted-foreground">
            영상에서 원어 자막을 뽑고 한국어로 옮깁니다. 영상·소리는 이 컴퓨터를 벗어나지 않고, 번역 엔진에는 자막 글자만 전달됩니다.
          </p>
        </div>
        {job && <Button onClick={() => void sendToStageTwo()}>2단계 자막·영상 편집 <ArrowRight /></Button>}
      </header>

      <Section title="영상 고르기">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            영상 선택
            <input type="file" accept={ACCEPT_VIDEO} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <span className="truncate text-sm text-muted-foreground">{file?.name ?? '선택된 영상이 없습니다'}</span>
        </div>
        <div className={cn('rounded-md border p-2.5 text-xs', sidecarReady && features.ytdlp ? '' : 'opacity-60')}>
          <p className="font-medium">유튜브에서 바로 받기 {(!sidecarReady || !features.ytdlp) && <span className="ml-1 rounded bg-muted px-1.5 py-0.5">내 컴퓨터 도우미 필요</span>}</p>
          <p className="mt-0.5 text-muted-foreground">
            {sidecarReady && features.ytdlp
              ? '도우미가 켜져 있습니다. 유튜브 주소를 넣으면 받아서 바로 자막을 만듭니다.'
              : '브라우저만으로는 유튜브 영상을 받을 수 없습니다. 도우미를 켜면 이 칸이 열립니다. 도우미 없이도 아래 기능은 모두 됩니다.'}
          </p>
        </div>
      </Section>

      <Section title="인식 · 말투">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="tr-lang" className="text-xs">원어</Label>
            <NativeSelect id="tr-lang" className="h-9" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-whisper" className="text-xs">음성 인식 모델</Label>
            <NativeSelect id="tr-whisper" className="h-9" value={whisper} onChange={(e) => setWhisper(e.target.value as WhisperSize)}>
              {Object.entries(WHISPER_MODELS).map(([id, m]) => (
                <option key={id} value={id}>{m.label} · 약 {m.downloadMb}MB</option>
              ))}
            </NativeSelect>
            <p className="text-[11px] text-muted-foreground">{WHISPER_MODELS[whisper].note}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-tone" className="text-xs">번역 말투</Label>
            <NativeSelect id="tr-tone" className="h-9" value={tone} onChange={(e) => setTone(e.target.value as TranslateTone)}>
              {Object.entries(TONE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tr-glossary" className="text-xs">용어 지정</Label>
          <Input id="tr-glossary" value={glossaryText} placeholder="Sunburst=선버스트, fidelity=정확도"
            onChange={(e) => { setGlossaryText(e.target.value); settings.setGlossaryText(e.target.value); }} />
          <p className="text-[11px] text-muted-foreground">쉼표나 줄바꿈으로 여러 개를 넣을 수 있습니다. 번역에 그대로 반영됩니다.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tr-engine" className="text-xs">번역 엔진</Label>
            <NativeSelect id="tr-engine" className="h-9" value={engine}
              onChange={(e) => { const v = e.target.value as TranslateEngineId; setEngine(v); settings.setTranslateEngine(v); }}>
              {Object.values(TRANSLATE_ENGINES).map((m) => (
                <option key={m.id} value={m.id} disabled={m.requiresSidecar && !features.translate}>
                  {m.displayName}{m.requiresSidecar && !features.translate ? ' (도우미 필요)' : ''}
                </option>
              ))}
            </NativeSelect>
            <p className="text-[11px] text-muted-foreground">{meta.description}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-mode" className="text-xs">번역 방식</Label>
            <NativeSelect id="tr-mode" className="h-9" value={mode} onChange={(e) => setMode(e.target.value as TranslateMode)}>
              {Object.entries(MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
            <p className="text-[11px] text-muted-foreground">
              {mode === 'precise' ? '번역한 뒤 전체를 다시 보며 존댓말·용어를 맞춥니다. 시간이 두 배쯤 걸립니다.' : '문장별로 바로 번역합니다. 빠른 대신 말투가 조금씩 다를 수 있습니다.'}
            </p>
          </div>
        </div>
      </Section>

      {busy ? (
        <StageProgress
          title="한국어 자막 만들기"
          stages={STAGES}
          run={busy.run}
          startedAt={busy.startedAt}
          done={busy.done}
          onCancel={() => abortRef.current?.abort()}
          textLabel={busy.run?.stageId === 'translate' ? '방금 번역한 문장' : '방금 알아들은 말'}
        />
      ) : (
        <Button size="lg" disabled={!file} onClick={() => (meta.sendsTextToServer ? setNotice(true) : void run())}>
          <Play /> 한국어 자막 생성
        </Button>
      )}

      {job && (
        <Section title={`번역 결과 ${job.rows.length}줄`} description="한국어 칸을 눌러 직접 고칠 수 있습니다. 고친 내용은 2단계로 그대로 넘어갑니다.">
          <div className="scrollbar-thin max-h-[26rem] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-20 px-2 py-1.5">시작</th>
                  <th className="px-2 py-1.5">원어</th>
                  <th className="px-2 py-1.5">한국어 자막</th>
                </tr>
              </thead>
              <tbody>
                {job.rows.map((row, i) => (
                  <tr key={`${row.start}-${i}`} className="border-t align-top">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{formatShort(row.start)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.text}</td>
                    <td className="px-1 py-1">
                      <input
                        value={row.translated}
                        aria-label={`${formatShort(row.start)} 한국어 자막`}
                        onChange={(e) => editRow(i, e.target.value)}
                        className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-primary focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void sendToStageTwo()}>2단계 자막·영상 편집 <ArrowRight /></Button>
            <Button variant="secondary" onClick={() => router.push(`/editor/${job.projectId}?panel=export`)}>
              <Download /> 자막 넣은 영상 저장
            </Button>
          </div>
        </Section>
      )}

      <ByokNoticeDialog
        open={notice}
        provider={engine === 'gemini' ? 'Google Gemini' : engine === 'deepl' ? 'DeepL' : '외부'}
        onCancel={() => setNotice(false)}
        onConfirm={() => { setNotice(false); void run(); }}
      />
    </div>
  );
}
