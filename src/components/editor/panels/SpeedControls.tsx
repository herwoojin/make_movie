'use client';

// 배속 (F-05). 적용 범위는 자막 서식과 같은 토글을 쓴다.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label, Switch } from '@/components/ui/misc';
import { formatDuration } from '@/lib/core/timecode';
import { clipSpeedRanges } from '@/lib/core/clips';
import { normalizeSpeed, outputDurationMs } from '@/lib/core/edl';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';
import { StyleScopeToggle } from './StyleScopeToggle';

const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function SpeedControls() {
  const scope = useUiStore((s) => s.styleScope);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const globalSpeed = useProjectStore((s) => s.doc.view.globalSpeed);
  const pitchPreserve = useProjectStore((s) => s.doc.view.pitchPreserve);
  const firstSpeed = useProjectStore((s) => s.doc.clips.find((c) => c.id === selectedIds[0])?.speed);
  const outMs = useProjectStore((s) => outputDurationMs(s.doc.edl, clipSpeedRanges(s.doc.clips), s.doc.view.globalSpeed));
  const mixed = useProjectStore((s) => {
    const speeds = new Set(s.doc.clips.filter((c) => c.enabled).map((c) => c.speed));
    return speeds.size > 1;
  });
  const [custom, setCustom] = useState('');

  const disabled = scope === 'clips' && selectedIds.length === 0;
  const current = scope === 'all' ? globalSpeed : (firstSpeed ?? 1);

  const apply = (speed: number) => {
    if (disabled) return;
    useProjectStore.getState().setClipSpeed(scope === 'all' ? 'all' : selectedIds, speed);
  };

  return (
    <>
      <StyleScopeToggle />
      <Section title="재생 속도" description="영상과 소리가 함께 빨라지거나 느려집니다. 자막 시간도 자동으로 다시 계산됩니다.">
        <div className={cn('flex flex-wrap gap-1.5', disabled && 'pointer-events-none opacity-50')}>
          {PRESETS.map((v) => (
            <Button key={v} size="sm" variant={Math.abs(current - v) < 0.001 ? 'default' : 'outline'} onClick={() => apply(v)}>
              {v}×
            </Button>
          ))}
        </div>
        <form
          className={cn('flex items-end gap-2', disabled && 'pointer-events-none opacity-50')}
          onSubmit={(e) => {
            e.preventDefault();
            const v = normalizeSpeed(Number(custom));
            if (Number.isFinite(Number(custom)) && custom.trim()) apply(v);
            setCustom('');
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="speed-custom" className="text-xs">직접 입력 (0.25 ~ 4)</Label>
            <Input id="speed-custom" className="h-8 w-24" inputMode="decimal" placeholder="예: 1.3" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
          <Button size="sm" type="submit" variant="secondary">적용</Button>
        </form>

        <label className="flex items-center justify-between text-sm">
          음정 유지
          <Switch checked={pitchPreserve} onCheckedChange={(v) => useProjectStore.getState().setView({ pitchPreserve: v })} aria-label="음정 유지" />
        </label>
        <p className="text-xs text-muted-foreground">
          {pitchPreserve
            ? '목소리 톤을 그대로 두고 속도만 바꿉니다. 내보낼 때 예비 인코더(ffmpeg)를 씁니다.'
            : '끄면 빨리 감기처럼 목소리도 높아집니다. 내보내기가 더 빠릅니다.'}
        </p>
        {pitchPreserve && mixed && (
          <p className="text-xs text-amber-300">
            클립마다 배속이 다르면 음정 유지를 쓸 수 없습니다. 배속을 “영상 전체”로 하나만 걸거나 음정 유지를 꺼 주세요.
          </p>
        )}
        <p className="text-xs text-muted-foreground">지금 설정으로 결과 길이는 {formatDuration(outMs)}입니다.</p>
      </Section>
    </>
  );
}
