import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { toAppError } from '@/lib/errors';

export type PanelId = 'autocut' | 'subtitle' | 'style' | 'mosaic' | 'export';

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
  setDrawMosaic: (on: boolean) => void;
  /** 미리보기에 모자이크를 실제로 적용해 보여줄지 (끄면 원본 얼굴 위에 테두리만) */
  previewMosaic: boolean;
  setPreviewMosaic: (on: boolean) => void;
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
    if (err.code === 'ABORTED') return;
    get().toast({ kind: 'error', title: err.message, hint: err.hint });
  },
  drawMosaic: false,
  setDrawMosaic: (drawMosaic) => set({ drawMosaic }),
  previewMosaic: true,
  setPreviewMosaic: (previewMosaic) => set({ previewMosaic }),
}));
