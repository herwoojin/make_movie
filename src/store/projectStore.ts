// 열린 프로젝트의 상태. 편집 문서(doc)는 immer 패치로 되돌리기를 기록하고, 800ms 디바운스로 IndexedDB에 저장한다.
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { CutSuggestion, MediaAsset, Project, Transcript, TranscriptWord } from '@/types/models';
import type { EditorDoc } from '@/types/editor';
import { commit, createHistory, redo as redoPatch, undo as undoPatch, UNDO_LIMIT, type UndoHistory } from '@/lib/core/undo';
import { analyzeAudio } from '@/lib/editor/importPipeline';
import { toAppError, type AppErrorShape } from '@/lib/errors';
import { defaultStyle, getSourceFile, isSameSource, loadProjectBundle, saveProjectDoc } from '@/lib/storage/projectRepo';
import { writeFile } from '@/lib/storage/opfs';
import { getDb } from '@/lib/storage/db';
import { remapCues } from '@/lib/subtitle/model';
import { useUiStore } from './uiStore';

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

interface ProjectState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: AppErrorShape | null;
  project: Project | null;
  asset: MediaAsset | null;
  source: File | null;
  sourceUrl: string | null;
  sourceMissing: boolean;
  peaks: Int8Array | null;
  analysis: { ratio: number; label: string } | null;
  transcript: Transcript | null;
  words: TranscriptWord[];
  doc: EditorDoc;
  history: UndoHistory;
  suggestions: CutSuggestion[];
  /** 모자이크 검출 샘플 간격 (첫/마지막 검출 앞뒤 노출 방지) */
  mosaicHoldMs: number;
  saveState: SaveState;

  load: (projectId: string) => Promise<void>;
  unload: () => void;
  edit: (label: string, recipe: (draft: Draft<EditorDoc>) => void, opts?: { history?: boolean }) => void;
  undo: () => string | null;
  redo: () => string | null;
  setSuggestions: (s: CutSuggestion[]) => void;
  setTranscript: (t: Transcript, words: TranscriptWord[]) => void;
  setMosaicHoldMs: (ms: number) => void;
  runAnalysis: () => Promise<void>;
  relinkSource: (file: File) => Promise<void>;
  flush: () => Promise<void>;
}

const emptyDoc = (): EditorDoc => ({ edl: [], cues: [], style: defaultStyle(''), tracks: [] });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let analysisAbort: AbortController | null = null;

function scheduleSave(): void {
  useProjectStore.setState({ saveState: 'pending' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useProjectStore.getState().flush(), 800);
}

/** 컷이 바뀌면 자막을 원본 앵커 기준으로 다시 매핑 — 같은 undo 단계에 묶어야 되돌릴 때 자막도 함께 돌아온다 */
function withCueRemap(recipe: (draft: Draft<EditorDoc>) => void) {
  return (draft: Draft<EditorDoc>) => {
    recipe(draft);
    const remapped = remapCues(draft.cues, draft.edl);
    if (remapped.some((c, i) => c !== draft.cues[i])) draft.cues = remapped;
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  status: 'idle',
  error: null,
  project: null,
  asset: null,
  source: null,
  sourceUrl: null,
  sourceMissing: false,
  peaks: null,
  analysis: null,
  transcript: null,
  words: [],
  doc: emptyDoc(),
  history: createHistory(),
  suggestions: [],
  mosaicHoldMs: 166,
  saveState: 'saved',

  load: async (projectId) => {
    if (get().project?.id === projectId && get().status === 'ready') return;
    get().unload();
    set({ status: 'loading', error: null });
    try {
      const b = await loadProjectBundle(projectId);
      let source: File | null = null;
      try {
        source = await getSourceFile(b.asset);
      } catch {
        source = null;
      }
      set({
        status: 'ready', project: b.project, asset: b.asset, source, sourceUrl: source ? URL.createObjectURL(source) : null,
        sourceMissing: !source, peaks: b.peaks, transcript: b.transcript, words: b.words, doc: b.doc,
        history: { past: b.history.slice(-UNDO_LIMIT), future: [], limit: UNDO_LIMIT }, suggestions: b.suggestions,
        mosaicHoldMs: Math.round((5 * 1000) / (b.asset.fps || 30)), saveState: 'saved',
      });
      if (source && !b.peaks) void get().runAnalysis();
    } catch (e) {
      set({ status: 'error', error: toAppError(e).toJSON() });
    }
  },

  unload: () => {
    const { sourceUrl, project } = get();
    if (project && get().saveState !== 'saved') void get().flush();
    analysisAbort?.abort();
    analysisAbort = null;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    set({
      status: 'idle', project: null, asset: null, source: null, sourceUrl: null, sourceMissing: false, peaks: null, analysis: null,
      transcript: null, words: [], doc: emptyDoc(), history: createHistory(), suggestions: [], saveState: 'saved',
    });
  },

  edit: (label, recipe, opts = {}) => {
    const { doc, history } = get();
    if (opts.history === false) {
      const next = produce(doc, withCueRemap(recipe));
      if (next !== doc) {
        set({ doc: next });
        scheduleSave();
      }
      return;
    }
    const t = commit(doc, history, label, withCueRemap(recipe));
    if (t.state !== doc) {
      set({ doc: t.state, history: t.history });
      scheduleSave();
    }
  },

  undo: () => {
    const t = undoPatch(get().doc, get().history);
    if (!t.entry) return null;
    set({ doc: t.state, history: t.history });
    scheduleSave();
    return t.entry.label;
  },

  redo: () => {
    const t = redoPatch(get().doc, get().history);
    if (!t.entry) return null;
    set({ doc: t.state, history: t.history });
    scheduleSave();
    return t.entry.label;
  },

  setSuggestions: (suggestions) => {
    set({ suggestions });
    scheduleSave();
  },

  setTranscript: (transcript, words) => set({ transcript, words }),

  setMosaicHoldMs: (mosaicHoldMs) => set({ mosaicHoldMs }),

  runAnalysis: async () => {
    const { project, asset, source } = get();
    if (!project || !asset || !source) return;
    analysisAbort?.abort();
    const controller = new AbortController();
    analysisAbort = controller;
    set({ analysis: { ratio: 0, label: '소리 분석 준비 중' } });
    try {
      const peaks = await analyzeAudio(project.id, asset, source, (ratio, label) => {
        if (get().project?.id === project.id) set({ analysis: { ratio, label } });
      }, controller.signal);
      if (get().project?.id !== project.id) return;
      set({ peaks, analysis: null });
      if (!peaks) useUiStore.getState().toast({ kind: 'info', title: '이 영상에는 소리가 없습니다.', hint: '무음 감지·자막 생성 없이 컷 편집과 모자이크는 쓸 수 있습니다.' });
    } catch (e) {
      set({ analysis: null });
      useUiStore.getState().showError(e);
    }
  },

  relinkSource: async (file) => {
    const { asset, project } = get();
    if (!asset || !project) return;
    if (!isSameSource(asset, file)) {
      useUiStore.getState().toast({ kind: 'error', title: '원래 영상과 크기가 다른 파일입니다.', hint: '프로젝트를 만들 때 올렸던 바로 그 파일을 선택해 주세요.' });
      return;
    }
    await writeFile(asset.opfsPath, file);
    const source = await getSourceFile(asset);
    const old = get().sourceUrl;
    if (old) URL.revokeObjectURL(old);
    set({ source, sourceUrl: URL.createObjectURL(source), sourceMissing: false });
    const hasWaveform = await getDb().waveforms.where('assetId').equals(asset.id).count();
    if (!hasWaveform) void get().runAnalysis();
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const { project, doc, suggestions, history } = get();
    if (!project) return;
    set({ saveState: 'saving' });
    try {
      const saved = await saveProjectDoc(project, doc, suggestions, history);
      if (get().project?.id === saved.id) {
        set({ project: saved, saveState: get().saveState === 'saving' ? 'saved' : get().saveState });
      }
    } catch (e) {
      set({ saveState: 'failed' });
      useUiStore.getState().showError(e);
    }
  },
}));
