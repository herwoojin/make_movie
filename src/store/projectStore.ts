// 열린 프로젝트의 상태. 편집 문서(doc)는 immer 패치로 되돌리기를 기록하고, 800ms 디바운스로 IndexedDB에 저장한다.
// v2: 편집의 단위는 클립(EditClip) + 단어 칩(TranscriptWord)이다.
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { CutSuggestion, EditClip, MediaAsset, Project, StyleValues, Transcript, TranscriptWord } from '@/types/models';
import { DEFAULT_PROJECT_VIEW, type EditorDoc, type ProjectView } from '@/types/editor';
import {
  applyWordCuts, buildClipsFromWords, clipSpeedRanges, deleteWord as deleteWordPure, renumberClips, resetCaption as resetCaptionPure,
  restoreWord as restoreWordPure, restoreWordCut, setCaptionText as setCaptionPure, setClipEnabled as setClipEnabledPure, setTranslatedText, type ClipState,
} from '@/lib/core/clips';
import { applySuggestions, createTimeMap, normalizeSpeed, restoreRange, type SpeedRange, type TimeMap } from '@/lib/core/edl';
import { commit, createHistory, redo as redoPatch, undo as undoPatch, UNDO_LIMIT, type UndoHistory } from '@/lib/core/undo';
import { analyzeAudio } from '@/lib/editor/importPipeline';
import { toAppError, type AppErrorShape } from '@/lib/errors';
import { defaultStyle, getSourceFile, isSameSource, loadProjectBundle, saveProjectDoc } from '@/lib/storage/projectRepo';
import { writeFile } from '@/lib/storage/opfs';
import { getDb } from '@/lib/storage/db';
import { useUiStore } from './uiStore';

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

export interface ReplaceTranscriptOptions {
  sourceKind?: EditClip['sourceKind'];
  /** 이미 만들어 둔 클립 (SRT 불러오기 등). 주면 단어에서 다시 묶지 않는다 */
  clips?: EditClip[];
  label?: string;
}

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

  // ── v2 편집 액션 ─────────────────────────────────────
  setClips: (label: string, next: ClipState, opts?: { rebuildEdl?: boolean }) => void;
  deleteWord: (wordId: string) => void;
  restoreWord: (wordId: string) => void;
  setClipEnabled: (clipId: string, enabled: boolean) => void;
  removeClips: (clipIds: string[]) => void;
  setCaption: (clipId: string, text: string) => void;
  resetCaption: (clipId: string) => void;
  setTranslation: (clipId: string, text: string) => void;
  setClipSpeed: (clipIds: string[] | 'all', speed: number) => void;
  setClipStyle: (clipIds: string[] | 'all', patch: Partial<StyleValues>) => void;
  setView: (patch: Partial<ProjectView>) => void;
  replaceTranscript: (transcript: Transcript, words: TranscriptWord[], opts?: ReplaceTranscriptOptions) => void;

  setSuggestions: (s: CutSuggestion[]) => void;
  setMosaicHoldMs: (ms: number) => void;
  runAnalysis: () => Promise<void>;
  relinkSource: (file: File) => Promise<void>;
  flush: () => Promise<void>;
}

const emptyDoc = (): EditorDoc => ({ edl: [], clips: [], words: [], style: defaultStyle(''), tracks: [], view: { ...DEFAULT_PROJECT_VIEW } });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let analysisAbort: AbortController | null = null;
let loadSeq = 0;

function scheduleSave(): void {
  useProjectStore.setState({ saveState: 'pending' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useProjectStore.getState().flush(), 800);
}

/** 클립 배속 + 전체 배속 → 시간 변환용 구간 목록 */
export function docSpeedRanges(doc: EditorDoc): SpeedRange[] {
  return clipSpeedRanges(doc.clips);
}

export function docTimeMap(doc: EditorDoc): TimeMap {
  return createTimeMap(doc.edl, docSpeedRanges(doc), doc.view.globalSpeed);
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
  doc: emptyDoc(),
  history: createHistory(),
  suggestions: [],
  mosaicHoldMs: 166,
  saveState: 'saved',

  load: async (projectId) => {
    if (get().project?.id === projectId && get().status === 'ready') return;
    get().unload();
    const seq = ++loadSeq;
    set({ status: 'loading', error: null });
    try {
      const b = await loadProjectBundle(projectId);
      let source: File | null = null;
      try {
        source = await getSourceFile(b.asset);
      } catch {
        source = null;
      }
      if (seq !== loadSeq) return;
      set({
        status: 'ready', project: b.project, asset: b.asset, source, sourceUrl: source ? URL.createObjectURL(source) : null,
        sourceMissing: !source, peaks: b.peaks, transcript: b.transcript, doc: b.doc,
        history: { past: b.history.slice(-UNDO_LIMIT), future: [], limit: UNDO_LIMIT }, suggestions: b.suggestions,
        mosaicHoldMs: Math.round((5 * 1000) / (b.asset.fps || 30)), saveState: 'saved',
      });
      if (source && !b.peaks) void get().runAnalysis();
    } catch (e) {
      if (seq === loadSeq) set({ status: 'error', error: toAppError(e).toJSON() });
    }
  },

  unload: () => {
    const { sourceUrl, project } = get();
    if (project && get().saveState !== 'saved') void get().flush();
    analysisAbort?.abort();
    analysisAbort = null;
    loadSeq += 1;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    set({
      status: 'idle', project: null, asset: null, source: null, sourceUrl: null, sourceMissing: false, peaks: null, analysis: null,
      transcript: null, doc: emptyDoc(), history: createHistory(), suggestions: [], saveState: 'saved',
    });
  },

  edit: (label, recipe, opts = {}) => {
    const { doc, history } = get();
    if (opts.history === false) {
      const next = produce(doc, recipe);
      if (next !== doc) {
        set({ doc: next });
        scheduleSave();
      }
      return;
    }
    const t = commit(doc, history, label, recipe);
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

  setClips: (label, next, opts = {}) => {
    get().edit(label, (d) => {
      d.clips = next.clips;
      d.words = next.words;
      if (opts.rebuildEdl) {
        for (const clip of next.clips) {
          d.edl = applyWordCuts(d.edl, next.words, clip.id, undefined, Date.now());
        }
      }
    });
  },

  deleteWord: (wordId) => {
    const { doc } = get();
    const target = doc.words.find((w) => w.id === wordId);
    if (!target || target.deleted) return;
    const now = Date.now();
    get().edit('단어 지우기', (d) => {
      const next = deleteWordPure({ clips: d.clips, words: d.words }, wordId, now);
      d.clips = next.clips;
      d.words = next.words;
      // F-01: 제안이 아니라 즉시 EDL에 반영한다 (원본 데이터는 그대로 두고 되돌릴 수 있게)
      d.edl = applyWordCuts(d.edl, next.words, target.clipId, undefined, now);
    });
  },

  restoreWord: (wordId) => {
    const { doc } = get();
    const target = doc.words.find((w) => w.id === wordId);
    if (!target || !target.deleted) return;
    const now = Date.now();
    get().edit('지운 단어 되살리기', (d) => {
      const next = restoreWordPure({ clips: d.clips, words: d.words }, wordId);
      d.clips = next.clips;
      d.words = next.words;
      d.edl = restoreWordCut(d.edl, target, undefined, now);
      reapplyCuts(d, target.clipId, now);
    });
  },

  setClipEnabled: (clipId, enabled) => {
    const { doc } = get();
    const clip = doc.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const now = Date.now();
    // 직접 넣은 자막 클립(단어 칩이 없다)은 영상을 자르는 게 아니라 자막 줄만 없애는 것이다
    if (!enabled && !doc.words.some((w) => w.clipId === clipId)) {
      get().edit('자막 클립 삭제', (d) => { d.clips = renumberClips(d.clips.filter((c) => c.id !== clipId)); });
      return;
    }
    get().edit(enabled ? '클립 되살리기' : '클립 삭제', (d) => {
      const next = setClipEnabledPure({ clips: d.clips, words: d.words }, clipId, enabled, now);
      d.clips = next.clips;
      d.words = next.words;
      if (enabled) d.edl = restoreRange(d.edl, { startMs: clip.sourceStartMs, endMs: clip.sourceEndMs }, now);
      reapplyCuts(d, clipId, now);
    });
  },

  removeClips: (clipIds) => {
    if (clipIds.length === 0) return;
    const now = Date.now();
    const { doc } = get();
    const withWords = clipIds.filter((id) => doc.words.some((w) => w.clipId === id));
    const wordless = clipIds.filter((id) => !withWords.includes(id));
    get().edit(`클립 ${clipIds.length}개 삭제`, (d) => {
      let state: ClipState = { clips: d.clips, words: d.words };
      for (const id of withWords) state = setClipEnabledPure(state, id, false, now);
      d.clips = wordless.length ? renumberClips(state.clips.filter((c) => !wordless.includes(c.id))) : state.clips;
      d.words = state.words;
      for (const id of withWords) d.edl = applyWordCuts(d.edl, state.words, id, undefined, now);
    });
  },

  setCaption: (clipId, text) => {
    get().edit('자막 글자 수정', (d) => {
      const next = setCaptionPure({ clips: d.clips, words: d.words }, clipId, text);
      d.clips = next.clips;
    });
  },

  resetCaption: (clipId) => {
    get().edit('자막 자동 생성으로 되돌리기', (d) => {
      const next = resetCaptionPure({ clips: d.clips, words: d.words }, clipId);
      d.clips = next.clips;
    });
  },

  setTranslation: (clipId, text) => {
    get().edit('한국어 자막 수정', (d) => {
      d.clips = setTranslatedText({ clips: d.clips, words: d.words }, clipId, text).clips;
    });
  },

  setClipSpeed: (clipIds, speed) => {
    const value = normalizeSpeed(speed);
    get().edit(clipIds === 'all' ? `전체 배속 ${value}×` : `클립 배속 ${value}×`, (d) => {
      const ids = clipIds === 'all' ? null : new Set(clipIds);
      d.clips.forEach((c) => {
        if (!ids || ids.has(c.id)) c.speed = value;
      });
      if (clipIds === 'all') d.view.globalSpeed = value;
    });
  },

  setClipStyle: (clipIds, patch) => {
    get().edit(clipIds === 'all' ? '자막 서식 (영상 전체)' : '자막 서식 (선택 클립)', (d) => {
      if (clipIds === 'all') {
        Object.assign(d.style, patch);
        // 전체에 적용하면 클립별 예외는 지운다 (두 곳이 어긋나 헷갈리는 것을 막는다)
        d.clips.forEach((c) => { delete c.styleOverride; });
        return;
      }
      const ids = new Set(clipIds);
      d.clips.forEach((c) => {
        if (ids.has(c.id)) c.styleOverride = { ...c.styleOverride, ...patch };
      });
    }, { history: false });
  },

  setView: (patch) => {
    get().edit('화면 설정', (d) => { Object.assign(d.view, patch); }, { history: false });
  },

  replaceTranscript: (transcript, words, opts = {}) => {
    const projectId = get().project?.id ?? '';
    set({ transcript });
    get().edit(opts.label ?? '자막 클립 만들기', (d) => {
      if (opts.clips) {
        // 외부 자막 파일처럼 클립이 이미 만들어진 경우 (단어는 글자 수로 어림잡은 시간)
        d.clips = renumberClips(opts.clips);
        d.words = words;
        return;
      }
      const built = buildClipsFromWords(words, {
        projectId,
        maxChars: d.style.maxCharsPerLine * d.style.maxLines,
        sourceKind: opts.sourceKind ?? 'video-edit',
      });
      d.clips = renumberClips(built.clips);
      d.words = built.words;
    });
  },

  setSuggestions: (suggestions) => {
    set({ suggestions });
    scheduleSave();
  },

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

/**
 * 되살린 구간에 아직 유효한 컷을 다시 입힌다.
 * 구간을 되살리면 그 자리에 걸쳐 있던 다른 컷(아직 지운 상태인 단어, 승인한 무음 구간)까지 함께 살아나므로
 * 지금도 유효한 컷만 골라 한 번 더 적용한다.
 */
function reapplyCuts(d: Draft<EditorDoc>, clipId: string, now: number): void {
  d.edl = applyWordCuts(d.edl, d.words, clipId, undefined, now);
  const accepted = useProjectStore.getState().suggestions.filter((s) => s.decision === 'accepted');
  if (accepted.length) {
    d.edl = applySuggestions(d.edl, accepted.map((s) => ({ startMs: s.startMs, endMs: s.endMs, source: s.source })), undefined, now);
  }
}
