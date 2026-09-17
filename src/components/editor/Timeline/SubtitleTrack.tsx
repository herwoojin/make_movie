'use client';

// 자막 클립 띠. v2에서 자막 시간은 단어에서 나오므로 여기서 끌어 옮기지 않는다 — 누르면 그 클립으로 이동한다.
import { clipKeptRanges } from '@/lib/core/clips';
import { player } from '@/lib/editor/player';
import { clipCaption } from '@/lib/subtitle/clipCues';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

export function SubtitleTrack() {
  const clips = useProjectStore((s) => s.doc.clips);
  const pxPerSec = useTimelineStore((s) => s.pxPerSec);
  const selected = useTimelineStore((s) => s.selectedClipIds);

  return (
    <div className="relative h-8 border-b">
      {clips.map((c) => {
        const text = clipCaption(c);
        return (
          <button
            key={c.id}
            type="button"
            title={`${c.idx + 1}. ${text}`}
            aria-label={`${c.idx + 1}번 클립: ${text}`}
            onClick={() => {
              const kept = clipKeptRanges(c, useProjectStore.getState().doc.words);
              const at = kept[0]?.startMs ?? c.sourceStartMs;
              player.pause();
              player.seek(at);
              useTimelineStore.getState().setCurrentMs(at);
            }}
            className={cn(
              'absolute top-1 flex h-6 items-center overflow-hidden rounded-sm border px-1 text-[11px] leading-none',
              c.enabled ? 'border-sky-400/60 bg-sky-500/25 text-sky-100' : 'hatch border-dashed border-muted-foreground/50 text-muted-foreground',
              selected.includes(c.id) && 'z-10 ring-2 ring-sky-300',
            )}
            style={{
              left: (c.sourceStartMs / 1000) * pxPerSec,
              width: Math.max(4, ((c.sourceEndMs - c.sourceStartMs) / 1000) * pxPerSec),
            }}
          >
            <span className="pointer-events-none truncate">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
