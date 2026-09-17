// 타임라인 UI 상태. 시간은 전부 "원본 기준 ms" — 잘린 구간도 빗금으로 보여줘야 복원할 수 있기 때문.
import { create } from 'zustand';

export const MIN_PX_PER_SEC = 1;
export const MAX_PX_PER_SEC = 500;

interface TimelineState {
  currentMs: number;
  playing: boolean;
  pxPerSec: number;
  durationMs: number;
  selectedSegmentId: string | null;
  /** 클립 목록 체크박스 선택 (v2). 휘발성이라 저장하지 않는다 */
  selectedClipIds: string[];
  selectedTrackId: string | null;
  setCurrentMs: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (ms: number) => void;
  setZoom: (pxPerSec: number) => void;
  zoomBy: (factor: number) => void;
  fitToWidth: (widthPx: number) => void;
  selectSegment: (id: string | null) => void;
  toggleClipSelected: (id: string) => void;
  setSelectedClips: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  reset: () => void;
}

const clampZoom = (z: number) => Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, z));

export const useTimelineStore = create<TimelineState>((set, get) => ({
  currentMs: 0,
  playing: false,
  pxPerSec: 50,
  durationMs: 0,
  selectedSegmentId: null,
  selectedClipIds: [],
  selectedTrackId: null,
  setCurrentMs: (ms) => {
    const next = Math.max(0, Math.round(ms));
    if (next !== get().currentMs) set({ currentMs: next });
  },
  setPlaying: (playing) => set({ playing }),
  setDuration: (durationMs) => set({ durationMs }),
  setZoom: (pxPerSec) => set({ pxPerSec: clampZoom(pxPerSec) }),
  zoomBy: (factor) => set({ pxPerSec: clampZoom(get().pxPerSec * factor) }),
  fitToWidth: (widthPx) => {
    const { durationMs } = get();
    if (durationMs > 0 && widthPx > 0) set({ pxPerSec: clampZoom((widthPx / durationMs) * 1000) });
  },
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  toggleClipSelected: (id) => {
    const cur = get().selectedClipIds;
    set({ selectedClipIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  setSelectedClips: (selectedClipIds) => set({ selectedClipIds }),
  selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  reset: () => set({ currentMs: 0, playing: false, selectedSegmentId: null, selectedClipIds: [], selectedTrackId: null }),
}));
