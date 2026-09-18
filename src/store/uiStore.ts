import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { toAppError } from '@/lib/errors';
import type { RegionRange } from '@/lib/vision/manualRegion';

export type PanelId = 'autocut' | 'subtitle' | 'style' | 'mosaic' | 'export';
export type StyleScope = 'clips' | 'all';
export type StylePanelTab = 'style' | 'speed';

/** 화면 아래 상태 바에 보여줄 한 줄 (PRD-v2 F-12) */
export interface StatusLine {
  kind: 'idle' | 'busy' | 'done' | 'error';
  text: string;
  hint?: string;
  startedAt?: number;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

interface UiState {
  panel: PanelId;
  setPanel: (panel: PanelId) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  /** 에러를 사용자용 문장(무엇이 + 다음에 할 일)으로 보여준다. 취소는 조용히 넘긴다 */
  showError: (e: unknown) => void;
  drawMosaic: boolean;
  /** 새로 그리는 가림 영역을 어느 구간에 걸지 */
  regionRange: RegionRange;
  setRegionRange: (range: RegionRange) => void;
  setDrawMosaic: (on: boolean) => void;
  /** 미리보기에 모자이크를 실제로 적용해 보여줄지 (끄면 원본 얼굴 위에 테두리만) */
  previewMosaic: boolean;
  setPreviewMosaic: (on: boolean) => void;
  // ── v2 클립 목록 ─────────────────────────────────────
  /** 재생 위치의 클립으로 목록을 자동 스크롤 */
  autoFollow: boolean;
  setAutoFollow: (on: boolean) => void;
  /** 지운 단어를 취소선으로 보여줄지 */
  showDeletedWords: boolean;
  setShowDeletedWords: (on: boolean) => void;
  /** 타임라인(파형·컷 구간)을 펼쳐 둘지 — 평소에는 클립 목록만 보인다 */
  timelineOpen: boolean;
  setTimelineOpen: (on: boolean) => void;
  /** 서식·배속을 선택 클립에만 줄지, 영상 전체에 줄지 */
  styleScope: StyleScope;
  setStyleScope: (scope: StyleScope) => void;
  /** 꾸미기 패널 안의 탭 (클립 툴바에서도 바로 열 수 있어 스토어에 둔다) */
  stylePanelTab: StylePanelTab;
  openStylePanel: (tab: StylePanelTab) => void;
  status: StatusLine;
  setStatus: (status: StatusLine) => void;
  clearStatus: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  panel: 'autocut',
  setPanel: (panel) => set({ panel }),
  toasts: [],
  toast: (t) => {
    const id = nanoid(6);
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 9000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  showError: (e) => {
    const err = toAppError(e);
    if (err.code === 'ABORTED') {
      get().setStatus({ kind: 'idle', text: '취소했습니다' });
      return;
    }
    get().toast({ kind: 'error', title: err.message, hint: err.hint });
    get().setStatus({ kind: 'error', text: err.message, hint: err.hint });
  },
  drawMosaic: false,
  setDrawMosaic: (drawMosaic) => set({ drawMosaic }),
  regionRange: 'all',
  setRegionRange: (regionRange) => set({ regionRange }),
  previewMosaic: true,
  setPreviewMosaic: (previewMosaic) => set({ previewMosaic }),
  autoFollow: true,
  setAutoFollow: (autoFollow) => set({ autoFollow }),
  showDeletedWords: false,
  setShowDeletedWords: (showDeletedWords) => set({ showDeletedWords }),
  timelineOpen: false,
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  styleScope: 'all',
  setStyleScope: (styleScope) => set({ styleScope }),
  stylePanelTab: 'style',
  openStylePanel: (stylePanelTab) => set({ stylePanelTab, panel: 'style' }),
  status: { kind: 'idle', text: '준비 완료' },
  setStatus: (status) => set({ status }),
  clearStatus: () => set({ status: { kind: 'idle', text: '준비 완료' } }),
}));
