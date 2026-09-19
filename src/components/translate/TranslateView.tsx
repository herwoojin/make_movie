'use client';

// 1단계 · 해외 영상 한국어 자막 (F-07).
// 영상 → 원어 자막(Whisper) → 한국어 번역(BYOK/내 컴퓨터) → 표에서 손보기 → 2단계로 인계.
import { ArrowRight, Download, Languages, Play, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { TranslatedCue } from '@/lib/translate';
import { StageProgress } from '@/components/common/StageProgress';
import { ByokNoticeDialog } from '@/components/editor/panels/ByokNoticeDialog';
import { GeminiKeyField } from '@/components/settings/GeminiKeyField';
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
import { listProjects, loadProjectBundle, saveProjectDoc, saveTranscript, setPipelineStage } from '@/lib/storage/projectRepo';
import { createHistory } from '@/lib/core/undo';
import { MODE_LABELS, TONE_LABELS, TRANSLATE_ENGINES, parseGlossary, runTranslate, type TranslateEngineId, type TranslateMode, type TranslateTone } from '@/lib/translate';
import { prepareGemini } from '@/lib/translate/gemini';
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
/** 번역만 다시 할 때 — 음성 인식은 이미 끝나 저장돼 있다 */
const RETRY_STAGES = STAGES.filter((s) => s.id === 'translate' || s.id === 'save');

interface Job {
  projectId: string;
  fileName: string;
  rows: TranslatedCue[];
  /** 번역이 끝나지 못한 이유. 원어 자막은 저장돼 있어 번역만 다시 하면 된다 */
  failure?: { code: string; message: string; hint?: string };
}

/** 번역이 끝나지 않은 가장 최근 작업 — 새로고침해도 음성 인식을 다시 하지 않고 이어서 번역한다 */
async function findUnfinished(): Promise<Job | null> {
  const project = (await listProjects()).find((p) => p.sourceTool === 'translate' && p.pipelineStage === 1);
  if (!project) return null;
  const clips = await getDb().editClips.where('[projectId+idx]').between([project.id, -Infinity], [project.id, Infinity]).toArray();
  if (clips.length === 0 || clips.every((c) => c.translatedText?.trim())) return null;
  return {
    projectId: project.id,
    fileName: project.name,
    rows: clips.map((c) => ({ start: c.sourceStartMs, end: c.sourceEndMs, text: c.captionTextOriginal, translated: c.translatedText ?? '' })),
  };
}

/** 표의 번역을 프로젝트 클립에 넣는다 (행 i ↔ 클립 i) */
async function saveTranslations(projectId: string, rows: readonly TranslatedCue[]) {
  const bundle = await loadProjectBundle(projectId);
  const clips = bundle.doc.clips.map((c, i) => ({ ...c, translatedText: rows[i]?.translated ?? c.translatedText }));
  await saveProjectDoc(bundle.project, { ...bundle.doc, clips }, bundle.suggestions, createHistory());
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
  const [busy, setBusy] = useState<{ stages: StageDef[]; run: StageRun | null; startedAt: number; done: boolean } | null>(null);
  const [notice, setNotice] = useState(false);
  /** 시작 전에 확인해 보니 키가 틀림 — 음성 인식(오래 걸림)을 시작하기 전에 고치게 한다 */
  const [keyProblem, setKeyProblem] = useState<{ message: string; hint?: string } | null>(null);
  const [resume, setResume] = useState<Job | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setEngine(settings.getTranslateEngine());
    setGlossaryText(settings.getGlossaryText());
    let alive = true;
    void findUnfinished().then((r) => { if (alive) setResume(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const meta = TRANSLATE_ENGINES[engine];

  const step = (next: StageRun) => setBusy((b) => (b ? { ...b, run: next } : b));

  /**
   * 원어 자막을 한국어로. 실패하거나 취소해도 원어 자막과 이미 번역한 줄은 남고, "번역 다시 시도"로 번역만 다시 한다.
   * 빈 줄만 번역한다 — 모두 번역돼 있으면(재검수만 실패한 경우) 전체를 다시 한다.
   */
  const translate = async (projectId: string, fileName: string, base: readonly TranslatedCue[], signal: AbortSignal, skipped?: string[]) => {
    const todo = base.some((r) => !r.translated) ? base.flatMap((r, i) => (r.translated ? [] : [i])) : base.map((_, i) => i);
    const latest = base.map((r) => ({ ...r }));
    const merge = (part: readonly TranslatedCue[]) => part.forEach((r, k) => {
      if (r.translated) latest[todo[k]] = { ...latest[todo[k]], translated: r.translated };
    });
    step({ stageId: 'translate', ratio: 0, message: `자막 ${todo.length}줄 번역 준비`, skipped });
    try {
      const rows = await runTranslate({
        engine,
        cues: todo.map((i) => ({ start: base[i].start, end: base[i].end, text: base[i].text })),
        sourceLang,
        tone,
        mode,
        glossary: parseGlossary(glossaryText),
        signal,
        onRows: merge,
        onProgress: (done, total, message, preview) => step({
          stageId: 'translate',
          ratio: total ? done / total : 0,
          message: message ?? '번역하는 중',
          detail: { chunk: done, chunks: total, text: preview },
          skipped,
        }),
      });
      merge(rows);

      // 클립에 한국어를 담아 저장 (2단계에서 바로 쓴다)
      step({ stageId: 'save', ratio: 0.5, message: '프로젝트에 저장하는 중', skipped });
      await saveTranslations(projectId, latest);

      // 100%를 잠깐 보여 준 뒤 결과 표로 넘어간다
      setBusy((b) => (b ? { ...b, run: { stageId: 'save', ratio: 1, skipped }, done: true } : b));
      setJob({ projectId, fileName, rows: latest });
      useUiStore.getState().setStatus({ kind: 'done', text: `한국어 자막 ${latest.length}줄을 만들었습니다.` });
      setTimeout(() => setBusy((b) => (b?.done ? null : b)), 1500);
    } catch (e) {
      const err = toAppError(e);
      // 여기까지 번역한 줄은 살려 둔다
      await saveTranslations(projectId, latest).catch(() => undefined);
      setJob({ projectId, fileName, rows: latest, failure: { code: err.code, message: err.message, hint: err.hint } });
      useUiStore.getState().showError(err);
      setBusy(null);
    }
  };

  const run = async () => {
    if (!file) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    // 모델을 내려받은 적이 있는지 — 이미 받아 뒀으면 그 단계는 "이미 준비됨"으로 보인다
    let sawDownload = false;
    setJob(null);
    setResume(null);
    setKeyProblem(null);
    setBusy({ stages: STAGES, run: { stageId: 'load', ratio: 0, message: '준비 중' }, startedAt, done: false });
    useUiStore.getState().setStatus({ kind: 'busy', text: '해외 영상 한국어 자막을 만드는 중…', startedAt });
    let projectId: string;
    let base: TranslatedCue[];
    try {
      // ⓪ 번역 키부터 확인 — 음성 인식을 한참 한 뒤에 키 때문에 멈추지 않게
      if (engine === 'gemini') {
        step({ stageId: 'load', ratio: 0, message: '번역 키 확인 중' });
        try {
          await prepareGemini(ctrl.signal);
        } catch (e) {
          const err = toAppError(e);
          if (err.code === 'API_KEY_INVALID') setKeyProblem({ message: err.message, hint: err.hint });
          throw err;
        }
      }

      // ① 프로젝트로 들여오기 (원본은 이 컴퓨터 안에만 있다)
      ({ projectId } = await createProjectFromFile(file, (p) => step({ stageId: 'load', ratio: p.ratio, message: p.label }), ctrl.signal, {
        sourceTool: 'translate', pipelineStage: 1,
      }));
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

      // 원어 자막을 먼저 저장 — 번역이 실패해도 음성 인식을 처음부터 다시 하지 않는다
      const clips = renumberClips(built.clips);
      await saveProjectDoc(bundle.project, { ...bundle.doc, clips, words: built.words }, [], createHistory());
      await getDb().transcripts.update(transcript.id, { language: stt.language });
      base = clips.map((c) => ({ start: c.sourceStartMs, end: c.sourceEndMs, text: c.captionTextOriginal, translated: '' }));
    } catch (e) {
      useUiStore.getState().showError(toAppError(e));
      setBusy(null);
      return;
    }

    // ③ 번역 — 묶음마다 방금 번역한 문장을 보여 준다
    await translate(projectId, file.name, base, ctrl.signal, sawDownload ? undefined : ['model']);
  };

  /** 음성 인식은 그대로 두고 번역만 (엔진을 바꿔서 다시 해도 된다) */
  const translateOnly = (target: Job) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setResume(null);
    setBusy({ stages: RETRY_STAGES, run: { stageId: 'translate', ratio: 0, message: '번역 다시 시작' }, startedAt, done: false });
    useUiStore.getState().setStatus({ kind: 'busy', text: '번역을 다시 하는 중…', startedAt });
    void translate(target.projectId, target.fileName, target.rows, ctrl.signal);
  };
  const retryTranslate = () => job && translateOnly(job);

  const editRow = (index: number, translated: string) => {
    setJob((j) => (j ? { ...j, rows: j.rows.map((r, i) => (i === index ? { ...r, translated } : r)) } : j));
  };

  /** 표에서 고친 번역을 프로젝트에 반영하고 2단계로 (번역 못 한 줄은 원어 자막으로 간다) */
  const sendToStageTwo = async () => {
    if (!job) return;
    await saveTranslations(job.projectId, job.rows);
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
        {job && !busy && <Button onClick={() => void sendToStageTwo()}>2단계 자막·영상 편집 <ArrowRight /></Button>}
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

      {resume && !job && !busy && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">번역이 끝나지 않은 영상이 있습니다 — {resume.fileName}</p>
            <p className="text-xs text-muted-foreground">
              원어 자막 {resume.rows.length}줄이 저장돼 있습니다 (번역 {resume.rows.filter((r) => r.translated).length}/{resume.rows.length}줄).
              음성 인식 없이 남은 줄만 이어서 번역합니다.
            </p>
          </div>
          <Button size="sm" onClick={() => translateOnly(resume)}><RotateCcw /> 이어서 번역하기</Button>
        </div>
      )}

      {keyProblem && !busy && engine === 'gemini' && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">번역 키부터 고쳐 주세요 — {keyProblem.message}</p>
          {keyProblem.hint && <p className="text-xs text-muted-foreground">{keyProblem.hint}</p>}
          <p className="text-xs text-muted-foreground">음성 인식을 시작하기 전에 멈췄습니다. 아래에서 키를 확인한 뒤 “한국어 자막 생성”을 다시 눌러 주세요.</p>
          <GeminiKeyField onVerified={() => setKeyProblem(null)} />
        </div>
      )}

      {busy ? (
        <StageProgress
          title="한국어 자막 만들기"
          stages={busy.stages}
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

      {job && !busy && (
        <Section title={`번역 결과 ${job.rows.length}줄`} description="한국어 칸을 눌러 직접 고칠 수 있습니다. 고친 내용은 2단계로 그대로 넘어갑니다.">
          {job.failure && (
            <div role="alert" className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">번역을 끝내지 못했습니다 — {job.failure.message}</p>
              {job.failure.hint && <p className="text-xs text-muted-foreground">{job.failure.hint}</p>}
              <p className="text-xs text-muted-foreground">
                원어 자막은 저장돼 있어 음성 인식은 다시 하지 않습니다. 지금 {job.rows.filter((r) => r.translated).length}/{job.rows.length}줄 번역됨 —
                번역하지 못한 줄은 원어로 남고, 이대로 2단계로 넘어가도 됩니다.
              </p>
              {job.failure.code === 'API_KEY_INVALID' && engine === 'gemini' && (
                <div className="rounded-md border bg-background/40 p-2">
                  <GeminiKeyField onVerified={retryTranslate} />
                  <p className="mt-1 text-[11px] text-muted-foreground">키가 확인되면 바로 번역을 다시 시작합니다.</p>
                </div>
              )}
              <Button size="sm" onClick={retryTranslate}><RotateCcw /> 번역 다시 시도</Button>
            </div>
          )}
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
                        placeholder="아직 번역하지 않음"
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
