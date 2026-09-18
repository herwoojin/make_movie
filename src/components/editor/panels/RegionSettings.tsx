'use client';

// 직접 가린 영역 하나의 설정: 이름 · 가릴 구간 · 고정/움직임 · 시점별 위치 기록.
import type { MosaicTrackDoc } from '@/types/editor';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { formatShort, frameDurationMs } from '@/lib/core/timecode';
import { seekTo } from '@/lib/editor/actions';
import { hasKeyframeNear, manualBoxAt, placeRegion, removeKeyframeNear, type RegionMotion } from '@/lib/vision/manualRegion';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';

const MOTIONS: [RegionMotion, string][] = [['static', '고정'], ['moving', '움직이는 대상']];

export function RegionSettings({ track }: { track: MosaicTrackDoc }) {
  const now = useTimelineStore((s) => s.currentMs);
  const durationMs = useProjectStore((s) => s.asset?.durationMs ?? 0);
  const fps = useProjectStore((s) => s.asset?.fps ?? 30);
  const edit = useProjectStore((s) => s.edit);
  const frameMs = Math.ceil(frameDurationMs(fps));
  const motion = track.motion ?? 'static';
  const markedHere = hasKeyframeNear(track.keyframes, now, frameMs);

  const update = (label: string, recipe: (t: MosaicTrackDoc) => void, history = true) => {
    edit(label, (d) => {
      const t = d.tracks.find((x) => x.id === track.id);
      if (t) recipe(t as MosaicTrackDoc);
    }, { history });
  };

  const setMotion = (next: RegionMotion) => {
    if (next === motion) return;
    update(next === 'moving' ? '움직이는 대상으로 바꾸기' : '고정 영역으로 바꾸기', (t) => {
      if (next === 'static') {
        // 지금 보이는 자리 하나만 남긴다
        const here = manualBoxAt(t, t.keyframes, Math.max(t.startMs, Math.min(t.endMs, now)));
        if (here) t.keyframes = placeRegion(t.keyframes, t.id, now, here, 'static', frameMs);
      }
      t.motion = next;
    });
  };

  return (
    <div className="space-y-3 rounded-md border p-2.5">
      <div className="space-y-1">
        <Label htmlFor={`region-name-${track.id}`} className="text-xs">이름</Label>
        <Input
          id={`region-name-${track.id}`}
          className="h-8"
          value={track.personLabel}
          placeholder="예: 이메일 주소"
          onChange={(e) => update('영역 이름 바꾸기', (t) => { t.personLabel = e.target.value; }, false)}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs">
          가리는 구간 <b className="tabular-nums">{formatShort(track.startMs)} – {formatShort(track.endMs)}</b>
          {track.startMs <= 0 && track.endMs >= durationMs && <span className="text-muted-foreground"> (영상 전체)</span>}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="secondary"
            onClick={() => update('가리기 시작 지점 바꾸기', (t) => { t.startMs = Math.min(now, t.endMs - 100); })}>시작 = 현재 위치</Button>
          <Button size="sm" variant="secondary"
            onClick={() => update('가리기 끝 지점 바꾸기', (t) => { t.endMs = Math.max(now, t.startMs + 100); })}>끝 = 현재 위치</Button>
          <Button size="sm" variant="ghost"
            onClick={() => update('영상 전체 가리기', (t) => { t.startMs = 0; t.endMs = durationMs; })}>영상 전체</Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => seekTo(track.startMs)}>시작으로 이동</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => seekTo(track.endMs)}>끝으로 이동</Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Segmented label="움직임" value={motion} options={MOTIONS} onChange={setMotion} />
        {motion === 'static' ? (
          <p className="text-xs text-muted-foreground">
            영상 내내 같은 자리를 가립니다. 미리보기에서 네모를 끌어 옮기고, 모서리를 끌어 크기를 바꿉니다.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              재생 위치를 옮긴 뒤 미리보기에서 네모를 끌면 그 시점의 위치가 기록되고, 사이는 부드럽게 이어집니다.
              지금 {track.keyframes.length}곳 기록됨.
            </p>
            <Button size="sm" variant="ghost" disabled={!markedHere || track.keyframes.length <= 1}
              onClick={() => update('이 시점 위치 지우기', (t) => { t.keyframes = removeKeyframeNear(t.keyframes, now, frameMs); })}>
              이 시점 위치 지우기
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
