'use client';

import { ChevronFirst, ChevronLast, Pause, Play, Rewind, FastForward, Scissors, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { outputDurationMs, sourceToOutput } from '@/lib/core/edl';
import { formatTimecode, frameDurationMs } from '@/lib/core/timecode';
import { seekTo, splitAtPlayhead } from '@/lib/editor/actions';
import { player } from '@/lib/editor/player';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { SegmentInspector } from './SegmentInspector';

export function TransportBar() {
  const currentMs = useTimelineStore((s) => s.currentMs);
  const playing = useTimelineStore((s) => s.playing);
  const durationMs = useTimelineStore((s) => s.durationMs);
  const edl = useProjectStore((s) => s.doc.edl);
  const fps = useProjectStore((s) => s.asset?.fps ?? 30);
  const [muted, setMuted] = useState(false);
  const out = sourceToOutput(currentMs, edl);
  const step = (ms: number) => { player.pause(); seekTo(player.currentMs() + ms); };

  return (
    <div className="flex flex-wrap items-center gap-1 border-t bg-card px-2 py-1.5">
      <Button size="icon" variant="ghost" onClick={() => step(-5000)} aria-label="5초 뒤로 (Shift+←)" title="5초 뒤로 (Shift+←)"><Rewind /></Button>
      <Button size="icon" variant="ghost" onClick={() => step(-frameDurationMs(fps))} aria-label="1프레임 뒤로 (←)" title="1프레임 뒤로 (←)"><ChevronFirst /></Button>
      <Button size="icon" onClick={() => player.toggle()} aria-label={playing ? '정지 (Space)' : '재생 (Space)'} title="재생/정지 (Space)">
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button size="icon" variant="ghost" onClick={() => step(frameDurationMs(fps))} aria-label="1프레임 앞으로 (→)" title="1프레임 앞으로 (→)"><ChevronLast /></Button>
      <Button size="icon" variant="ghost" onClick={() => step(5000)} aria-label="5초 앞으로 (Shift+→)" title="5초 앞으로 (Shift+→)"><FastForward /></Button>
      <Button size="icon" variant="ghost" aria-label={muted ? '소리 켜기' : '소리 끄기'}
        onClick={() => { const v = player.element; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}>
        {muted ? <VolumeX /> : <Volume2 />}
      </Button>

      <div className="mx-2 font-mono text-sm tabular-nums" aria-live="off">
        <span title="원본 기준 위치">{formatTimecode(currentMs)} / {formatTimecode(durationMs)}</span>
        <span className="ml-3 text-xs text-muted-foreground" title="잘라낸 결과물 기준 위치">
          결과물 {out === null ? '잘린 구간' : formatTimecode(out)} / {formatTimecode(outputDurationMs(edl))}
        </span>
      </div>

      <Button size="sm" variant="secondary" onClick={splitAtPlayhead} title="재생헤드 위치에서 구간 나누기 (S)">
        <Scissors /> 여기서 자르기
      </Button>
      <SegmentInspector />
    </div>
  );
}
