'use client';

import type { MosaicMode, MosaicTrack } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { formatShort } from '@/lib/core/timecode';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

const MODES: [MosaicMode, string][] = [['pixelate', '픽셀'], ['blur', '흐리게'], ['box', '검은 박스'], ['emoji', '이모지']];
const EMOJIS = ['😊', '🙂', '😎', '🐶', '🐱', '⭐', '❤️', '🙈'];

export function MosaicControls() {
  const tracks = useProjectStore((s) => s.doc.tracks);
  const selectedId = useTimelineStore((s) => s.selectedTrackId);
  const target = tracks.find((t) => t.id === selectedId) ?? null;
  const current = target ?? tracks[0];
  if (!current) return null;

  const apply = (patch: Partial<MosaicTrack>, history = false) => {
    useProjectStore.getState().edit(target ? `${target.personLabel} 설정 변경` : '모든 대상 설정 변경', (d) => {
      d.tracks.forEach((t) => { if (!target || t.id === target.id) Object.assign(t, patch); });
    }, { history });
  };

  const now = () => useTimelineStore.getState().currentMs;

  return (
    <Section
      title={target ? `${target.personLabel} 설정` : '모든 대상 설정'}
      description={target ? '이 대상만 바뀝니다.' : '목록에서 대상을 누르면 그 대상만 따로 바꿀 수 있습니다.'}
      actions={target && <Button size="sm" variant="ghost" onClick={() => useTimelineStore.getState().selectTrack(null)}>전체에 적용</Button>}
    >
      <Segmented label="가리는 방식" value={current.mode} options={MODES} onChange={(mode) => apply({ mode }, true)} />
      {current.mode === 'emoji' && (
        <div role="radiogroup" aria-label="이모지 선택" className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={current.emoji === e} onClick={() => apply({ emoji: e }, true)}
              className={cn('rounded-md border px-2 py-1 text-lg', current.emoji === e && 'border-primary bg-primary/10')}>{e}</button>
          ))}
        </div>
      )}
      {(current.mode === 'pixelate' || current.mode === 'blur') && (
        <SliderField label="강도" value={current.intensity} min={4} max={80}
          hint="픽셀은 블록 크기, 흐리게는 흐림 정도입니다. 클수록 알아보기 어렵습니다." onChange={(v) => apply({ intensity: v })} />
      )}
      <SliderField label="가리는 영역 크기" value={current.scale} min={1} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}배`}
        hint="얼굴보다 얼마나 넓게 가릴지 정합니다. 머리카락·귀까지 가리려면 늘리세요." onChange={(v) => apply({ scale: v })} />
      <Segmented label="모양" value={current.shape} options={[['rect', '사각형'], ['ellipse', '타원']]} onChange={(shape) => apply({ shape }, true)} />
      {target?.createdBy === 'manual' && (
        <div className="space-y-1.5 rounded-md border p-2 text-xs">
          <p>가리는 시간: {formatShort(target.startMs)} – {formatShort(target.endMs)}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => apply({ startMs: now(), endMs: Math.max(target.endMs, now() + 100) }, true)}>시작 = 현재 위치</Button>
            <Button size="sm" variant="secondary" onClick={() => apply({ endMs: now(), startMs: Math.min(target.startMs, now() - 100) }, true)}>끝 = 현재 위치</Button>
          </div>
        </div>
      )}
    </Section>
  );
}
