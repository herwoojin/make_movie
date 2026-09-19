'use client';

// 클립 목록 — v2의 주 편집 화면. 가상 스크롤로 3,000개 클립에서도 스크롤이 끊기지 않게 한다.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EditClip, TranscriptWord } from '@/types/models';
import { clipAtSource, clipKeptRanges } from '@/lib/core/clips';
import { player } from '@/lib/editor/player';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { ClipRow, type ClipRowHandlers } from './ClipRow';

/** 수동으로 스크롤하면 자동 따라가기를 잠시 멈춘다 (PROMPT-v2 B-3) */
const FOLLOW_RESUME_MS = 3000;
const ROW_HEIGHT = 112;

/** 클립별 단어 묶음. 내용이 그대로인 클립은 이전 배열을 그대로 써서 ClipRow의 memo가 유지되게 한다 */
function groupWords(words: readonly TranscriptWord[], prev: Map<string, TranscriptWord[]>): Map<string, TranscriptWord[]> {
  const next = new Map<string, TranscriptWord[]>();
  for (const w of words) {
    const list = next.get(w.clipId);
    if (list) list.push(w);
    else next.set(w.clipId, [w]);
  }
  for (const [clipId, list] of next) {
    const old = prev.get(clipId);
    if (old && old.length === list.length && old.every((w, i) => w === list[i])) next.set(clipId, old);
  }
  return next;
}

export function ClipList() {
  const clips = useProjectStore((s) => s.doc.clips);
  const words = useProjectStore((s) => s.doc.words);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const autoFollow = useUiStore((s) => s.autoFollow);
  const showDeleted = useUiStore((s) => s.showDeletedWords);
  // 번역으로 만든 프로젝트(또는 번역이 하나라도 있는 프로젝트)면 한국어 줄을 함께 보여 준다
  const captionLang = useProjectStore((s) => (s.project?.sourceTool === 'translate' || s.doc.clips.some((c) => c.translatedText?.trim()) ? s.doc.view.captionLang : null));
  const activeClipId = useTimelineStore((s) => clipAtSource(useProjectStore.getState().doc.clips, s.currentMs)?.id ?? null);

  const parentRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef(new Map<string, TranscriptWord[]>());
  const pausedUntil = useRef(0);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => {
    groupsRef.current = groupWords(words, groupsRef.current);
    return groupsRef.current;
  }, [words]);

  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    getItemKey: (i) => clips[i]?.id ?? i,
  });

  useEffect(() => {
    if (!autoFollow || !activeClipId || Date.now() < pausedUntil.current) return;
    const idx = clips.findIndex((c) => c.id === activeClipId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
  }, [activeClipId, autoFollow, clips, virtualizer]);

  const store = useProjectStore.getState;
  const handlers: ClipRowHandlers = useMemo(() => ({
    onToggleSelect: (id) => useTimelineStore.getState().toggleClipSelected(id),
    onPlay: (clip: EditClip) => {
      const kept = clipKeptRanges(clip, store().doc.words);
      if (kept.length === 0) return;
      player.playClip(clip.id, kept[0].startMs, kept[kept.length - 1].endMs);
    },
    onRemove: (id) => store().setClipEnabled(id, false),
    onRestoreClip: (id) => store().setClipEnabled(id, true),
    onDeleteWord: (id) => store().deleteWord(id),
    onRestoreWord: (id) => store().restoreWord(id),
    onSeek: (ms) => { player.pause(); player.seek(ms); useTimelineStore.getState().setCurrentMs(ms); },
    onCaption: (id, text) => store().setCaption(id, text),
    onResetCaption: (id) => store().resetCaption(id),
    onTranslation: (id, text) => store().setTranslation(id, text),
  }), [store]);

  const pauseFollow = useCallback(() => { pausedUntil.current = Date.now() + FOLLOW_RESUME_MS; }, []);

  if (clips.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        아직 클립이 없습니다. 왼쪽 <b className="mx-1 font-medium text-foreground">자막</b> 탭에서 자막을 만들면
        단어 하나하나를 지울 수 있는 클립 목록이 여기에 나옵니다.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      onWheel={pauseFollow}
      onPointerDown={pauseFollow}
      className="scrollbar-thin h-full overflow-y-auto px-3 py-2"
      aria-label={`자막 클립 ${clips.length}개`}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const clip = clips[item.index];
          if (!clip) return null;
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <ClipRow
                clip={clip}
                words={groups.get(clip.id) ?? []}
                selected={selected.has(clip.id)}
                active={activeClipId === clip.id}
                showDeleted={showDeleted}
                captionLang={captionLang}
                {...handlers}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
