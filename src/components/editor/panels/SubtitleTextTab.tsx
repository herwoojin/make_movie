'use client';

import { Plus, Replace } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
import type { SubtitleCue } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/misc';
import { outputDurationMs, sourceToOutput } from '@/lib/core/edl';
import { findOverlaps, findReplace, renumberCues, setCueTiming } from '@/lib/subtitle/model';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { CueRow } from './CueRow';
import { useActiveCueId } from './useActiveCue';

export function addCueAtPlayhead(): void {
  const { doc, project, edit } = useProjectStore.getState();
  const ms = useTimelineStore.getState().currentMs;
  const out = sourceToOutput(ms, doc.edl);
  if (!project || out === null) {
    useUiStore.getState().toast({ kind: 'info', title: '잘린 구간에는 자막을 넣을 수 없습니다.', hint: '재생헤드를 남아 있는 구간으로 옮겨 주세요.' });
    return;
  }
  const base: SubtitleCue = {
    id: `cue-${nanoid(8)}`, projectId: project.id, idx: 0, startMs: out, endMs: out + 2000,
    sourceStartMs: ms, sourceEndMs: ms + 2000, orphan: false, text: '새 자막', locked: false,
  };
  edit('자막 추가', (d) => {
    const end = Math.min(out + 2000, outputDurationMs(d.edl));
    d.cues = renumberCues([...d.cues, setCueTiming(base, out, Math.max(out + 100, end), d.edl)]);
  });
}

export function SubtitleTextTab() {
  const cues = useProjectStore((s) => s.doc.cues);
  const activeId = useActiveCueId();
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const live = useMemo(() => cues.filter((c) => !c.orphan).sort((a, b) => a.startMs - b.startMs), [cues]);
  const overlaps = useMemo(() => findOverlaps(cues), [cues]);
  const matches = useMemo(() => (find ? findReplace(live, find, replace).count : 0), [live, find, replace]);

  const replaceAll = () => {
    let count = 0;
    useProjectStore.getState().edit(`찾아바꾸기: ${find} → ${replace}`, (d) => {
      const r = findReplace(d.cues, find, replace);
      count = r.count;
      d.cues = r.cues;
    });
    useUiStore.getState().toast({ kind: 'success', title: `${count}곳을 바꿨습니다.` });
  };

  return (
    <div className="space-y-3">
      <form className="grid grid-cols-[1fr_1fr_auto] gap-1.5" onSubmit={(e) => { e.preventDefault(); if (matches) replaceAll(); }}>
        <Input className="h-8" placeholder="찾을 글자" value={find} onChange={(e) => setFind(e.target.value)} aria-label="찾을 글자" />
        <Input className="h-8" placeholder="바꿀 글자" value={replace} onChange={(e) => setReplace(e.target.value)} aria-label="바꿀 글자" />
        <Button size="sm" type="submit" disabled={!matches}><Replace /> {matches}곳</Button>
      </form>
      <Button size="sm" variant="secondary" onClick={addCueAtPlayhead}><Plus /> 재생 위치에 자막 추가</Button>
      <ul className="space-y-2" aria-label="자막 문장 목록">
        {live.map((c, i) => (
          <CueRow key={c.id} cue={c} active={c.id === activeId} overlap={overlaps.has(c.id)} isLast={i === live.length - 1} />
        ))}
      </ul>
    </div>
  );
}
