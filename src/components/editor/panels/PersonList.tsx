'use client';

import { Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Switch } from '@/components/ui/misc';
import { formatShort } from '@/lib/core/timecode';
import { seekTo } from '@/lib/editor/actions';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

export function PersonList() {
  const tracks = useProjectStore((s) => s.doc.tracks);
  const selected = useTimelineStore((s) => s.selectedTrackId);
  if (tracks.length === 0) return null;
  const edit = useProjectStore.getState().edit;

  return (
    <Section title={`가릴 대상 ${tracks.length}개`} description="스위치를 끄면 그 대상은 가리지 않습니다 (예: 본인). 누르면 처음 나오는 곳으로 이동합니다.">
      <ul className="space-y-1.5">
        {tracks.map((t) => (
          <li key={t.id} className={cn('flex items-center gap-2 rounded-md border p-2', selected === t.id && 'border-primary bg-primary/5')}>
            {t.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.thumbnail} alt={`${t.personLabel} 대표 얼굴`} className="h-10 w-10 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted" aria-hidden><Square className="h-4 w-4" /></div>
            )}
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { useTimelineStore.getState().selectTrack(t.id); seekTo(t.startMs); }}>
              <p className="truncate text-sm">{t.personLabel}</p>
              <p className="text-xs text-muted-foreground">
                {formatShort(t.startMs)} – {formatShort(t.endMs)}
                {t.createdBy === 'manual' ? ` · 직접 가림${t.motion === 'moving' ? ' · 움직임' : ''}` : ''}
              </p>
            </button>
            <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
              <Switch checked={t.enabled} aria-label={`${t.personLabel} 가리기`}
                onCheckedChange={(on) => edit(on ? `${t.personLabel} 가리기` : `${t.personLabel} 가리지 않기`, (d) => {
                  const x = d.tracks.find((y) => y.id === t.id);
                  if (x) x.enabled = on;
                })} />
              <span className={cn('text-[10px]', t.enabled ? 'text-red-400' : 'text-emerald-400')}>{t.enabled ? '가리기' : '가리지 않기'}</span>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label={`${t.personLabel} 삭제`}
              onClick={() => {
                edit(`${t.personLabel} 삭제`, (d) => { d.tracks = d.tracks.filter((y) => y.id !== t.id); });
                if (selected === t.id) useTimelineStore.getState().selectTrack(null);
              }}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
