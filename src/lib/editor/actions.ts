// 여러 곳(단축키·재생바·타임라인·패널)에서 같은 편집 명령을 쓰기 위한 액션 모음.
import { nanoid } from 'nanoid';
import { renumberClips } from '@/lib/core/clips';
import { clampBox, placeRegion, RANGE_LABELS, rangeFor, type RegionRange } from '@/lib/vision/manualRegion';
import { moveBoundary, segmentAt, sortSegments, splitAt, toggleSegment } from '@/lib/core/edl';
import { frameDurationMs } from '@/lib/core/timecode';
import type { Box } from '@/lib/vision/tracker';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { player } from './player';

export function seekTo(ms: number): void {
  const duration = useTimelineStore.getState().durationMs;
  const t = Math.round(Math.max(0, duration > 0 ? Math.min(ms, duration) : ms));
  player.seek(t);
  useTimelineStore.getState().setCurrentMs(t);
}

export function splitAtPlayhead(): void {
  const ms = useTimelineStore.getState().currentMs;
  const store = useProjectStore.getState();
  const before = store.doc.edl.length;
  store.edit('구간 나누기', (d) => { d.edl = splitAt(d.edl, ms, undefined, Date.now()); });
  const after = useProjectStore.getState().doc.edl;
  if (after.length === before) {
    useUiStore.getState().toast({ kind: 'info', title: '여기서는 나눌 수 없습니다.', hint: '이미 구간 경계이거나 영상 끝입니다. 재생헤드를 조금 옮겨 보세요.' });
    return;
  }
  useTimelineStore.getState().selectSegment(segmentAt(after, ms)?.id ?? null);
}

export function toggleSegmentById(id: string): void {
  const seg = useProjectStore.getState().doc.edl.find((s) => s.id === id);
  if (!seg) return;
  useProjectStore.getState().edit(seg.enabled ? '구간 삭제' : '구간 복원', (d) => { d.edl = toggleSegment(d.edl, id, Date.now()); });
}

export function toggleSelectedSegment(): void {
  const { selectedSegmentId, currentMs } = useTimelineStore.getState();
  const id = selectedSegmentId ?? segmentAt(useProjectStore.getState().doc.edl, currentMs)?.id;
  if (id) toggleSegmentById(id);
}

/** 컷 경계를 1프레임 단위로 민다 (PRD B-6). 시작 경계는 앞 구간과 공유하는 경계다 */
export function nudgeSegmentEdge(id: string, edge: 'start' | 'end', frames: number): void {
  const { doc, asset, edit } = useProjectStore.getState();
  const frameMs = frameDurationMs(asset?.fps ?? 30);
  const sorted = sortSegments(doc.edl);
  const idx = sorted.findIndex((s) => s.id === id);
  const seg = sorted[idx];
  if (!seg) return;
  const leftId = edge === 'end' ? seg.id : sorted[idx - 1]?.id;
  const at = edge === 'end' ? seg.sourceEndMs : seg.sourceStartMs;
  if (!leftId) return;
  edit('컷 경계 미세 조정', (d) => { d.edl = moveBoundary(d.edl, leftId, at + frames * frameMs, Math.ceil(frameMs), Date.now()); });
  seekTo(at + frames * frameMs);
}

/** 미리보기에 그린 네모로 가림 영역을 만든다 (얼굴 말고 이메일·번호판 등). range: 가릴 구간 */
export function addManualMosaic(box: Box, range: RegionRange = useUiStore.getState().regionRange): void {
  const { project, asset, doc, edit } = useProjectStore.getState();
  if (!project || !asset) return;
  const t = useTimelineStore.getState().currentMs;
  const { startMs, endMs } = rangeFor(range, t, asset.durationMs);
  const id = `man-${nanoid(8)}`;
  const n = doc.tracks.filter((x) => x.createdBy === 'manual').length + 1;
  const b = clampBox(box);
  edit('직접 가릴 영역 추가', (d) => {
    // 새로 그린 영역이 목록 맨 위에 오도록 앞에 넣는다
    d.tracks.unshift({
      id, projectId: project.id, personLabel: `직접 가린 영역 ${n}`, enabled: true, mode: 'pixelate', intensity: 28, scale: 1,
      shape: 'rect', emoji: '😊', createdBy: 'manual', motion: 'static', startMs, endMs,
      keyframes: [{ id: `${id}-k0`, trackId: id, timeMs: Math.max(startMs, Math.min(endMs, t)), ...b, score: 1, interpolated: false }],
    });
  });
  useTimelineStore.getState().selectTrack(id);
  useUiStore.getState().toast({
    kind: 'success',
    title: `${RANGE_LABELS[range]} 동안 가립니다.`,
    hint: '미리보기에서 네모를 끌어 옮기거나 모서리로 크기를 바꿀 수 있습니다.',
  });
}

/** 선택한 직접 영역을 옮기거나 크기를 바꾼다 (고정이면 영상 내내, 움직임이면 지금 시각에 기록) */
export function placeManualRegion(trackId: string, box: Box): void {
  const t = useTimelineStore.getState().currentMs;
  const frameMs = Math.ceil(frameDurationMs(useProjectStore.getState().asset?.fps ?? 30));
  useProjectStore.getState().edit('가릴 영역 옮기기', (d) => {
    const track = d.tracks.find((x) => x.id === trackId);
    if (!track) return;
    track.keyframes = placeRegion(track.keyframes, trackId, t, box, track.motion ?? 'static', frameMs, () => `${trackId}-k${nanoid(6)}`);
  });
}

/** 음성 인식 없이 자막을 넣을 때: 재생 위치에 2초짜리 빈 클립을 만든다 (단어 칩은 없다) */
export function addClipAtPlayhead(): void {
  const { project, asset, doc, edit } = useProjectStore.getState();
  if (!project || !asset) return;
  const start = useTimelineStore.getState().currentMs;
  const end = Math.min(asset.durationMs, start + 2000);
  if (end - start < 100) {
    useUiStore.getState().toast({ kind: 'info', title: '여기서는 자막을 넣을 공간이 부족합니다.', hint: '재생헤드를 앞쪽으로 옮겨 주세요.' });
    return;
  }
  const id = `clip-${nanoid(8)}`;
  edit('자막 클립 추가', (d) => {
    d.clips = renumberClips([...doc.clips, {
      id, projectId: project.id, idx: d.clips.length, sourceKind: 'video-edit',
      sourceStartMs: start, sourceEndMs: end,
      captionText: '', captionTextOriginal: '', captionEdited: false, enabled: true, speed: 1,
    }]);
  });
  useTimelineStore.getState().setSelectedClips([id]);
}

/** 체크한 클립 빼기. 선택이 없으면 false를 돌려줘서 호출한 쪽이 다른 동작을 하게 한다 */
export function deleteSelectedClips(): boolean {
  const ids = useTimelineStore.getState().selectedClipIds;
  if (ids.length === 0) return false;
  useProjectStore.getState().removeClips(ids);
  useTimelineStore.getState().setSelectedClips([]);
  useUiStore.getState().toast({ kind: 'success', title: `클립 ${ids.length}개를 뺐습니다.`, hint: 'Ctrl+Z로 되살릴 수 있습니다.' });
  return true;
}

export function undoWithToast(): void {
  const label = useProjectStore.getState().undo();
  if (label) useUiStore.getState().toast({ kind: 'info', title: `되돌림: ${label}` });
}

export function redoWithToast(): void {
  const label = useProjectStore.getState().redo();
  if (label) useUiStore.getState().toast({ kind: 'info', title: `다시 함: ${label}` });
}
