'use client';

import type { StyleValues } from '@/types/models';
import { Section, SliderField } from '@/components/ui/field';
import { Label, NativeSelect, Switch } from '@/components/ui/misc';
import { ColorField, Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useUiStore } from '@/store/uiStore';

const FONTS: [string, string][] = [['Pretendard', '프리텐다드 (기본)'], ['sans-serif', '시스템 고딕'], ['serif', '시스템 명조']];
const WEIGHTS: [number, string][] = [[400, '보통'], [500, '중간'], [700, '굵게'], [800, '더 굵게'], [900, '가장 굵게']];

const px = (v: number) => `${v}px`;

export function StyleControls() {
  const scope = useUiStore((st) => st.styleScope);
  const selectedIds = useTimelineStore((st) => st.selectedClipIds);
  const base = useProjectStore((st) => st.doc.style);
  // 선택 클립 모드에서는 첫 번째 선택 클립의 지금 서식을 보여준다
  const override = useProjectStore((st) => (scope === 'clips' ? st.doc.clips.find((c) => c.id === selectedIds[0])?.styleOverride : undefined));

  const disabled = scope === 'clips' && selectedIds.length === 0;
  const s: StyleValues = override ? { ...base, ...override } : base;

  /** 슬라이더는 드래그하는 동안 수십 번 바뀌므로 되돌리기 기록 없이 반영한다 */
  const set = (patch: Partial<StyleValues>) => {
    if (disabled) return;
    useProjectStore.getState().setClipStyle(scope === 'all' ? 'all' : selectedIds, patch);
  };

  return (
    <fieldset className={cn('space-y-3 border-0 p-0', disabled && 'pointer-events-none opacity-50')} aria-disabled={disabled}>
      <Section title="글자">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="font-family" className="text-xs">글꼴</Label>
            <NativeSelect id="font-family" className="h-9" value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
              {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="font-weight" className="text-xs">굵기</Label>
            <NativeSelect id="font-weight" className="h-9" value={s.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
              {WEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </div>
        </div>
        <SliderField label="크기" value={s.fontSize} min={24} max={160} format={px} hint="가로 1920px 영상 기준 크기입니다. 해상도가 달라도 같은 비율로 보입니다." onChange={(v) => set({ fontSize: v })} />
        <label className="flex items-center justify-between text-sm">기울임 (I)
          <Switch checked={s.italic} onCheckedChange={(v) => set({ italic: v })} aria-label="기울임" /></label>
        <ColorField label="글자 색" value={s.color} onChange={(v) => set({ color: v })} />
      </Section>

      <Section title="글자 테두리 · 그림자" description="밝은 화면에서도 글자가 잘 보이게 합니다.">
        <label className="flex items-center justify-between text-sm">테두리 사용
          <Switch checked={s.outlineEnabled} onCheckedChange={(v) => set({ outlineEnabled: v })} aria-label="테두리 사용" /></label>
        {s.outlineEnabled && (
          <>
            <ColorField label="테두리 색" value={s.outlineColor} onChange={(v) => set({ outlineColor: v })} />
            <SliderField label="테두리 두께" value={s.outlineWidth} min={0} max={20} format={px} onChange={(v) => set({ outlineWidth: v })} />
          </>
        )}
        <SliderField label="그림자 번짐" value={s.shadowBlur} min={0} max={30} format={px} onChange={(v) => set({ shadowBlur: v })} />
      </Section>

      <Section title="배경" description="글자 뒤에 상자를 깔면 배경이 복잡한 영상에서도 잘 읽힙니다.">
        <label className="flex items-center justify-between text-sm">배경 사용
          <Switch checked={s.bgEnabled} onCheckedChange={(v) => set({ bgEnabled: v, ...(v && s.bgOpacity === 0 ? { bgOpacity: 0.72 } : {}) })} aria-label="배경 사용" /></label>
        {s.bgEnabled && (
          <>
            <ColorField label="배경 색" value={s.bgColor} onChange={(v) => set({ bgColor: v })} />
            <SliderField label="불투명도" value={Math.round(s.bgOpacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => set({ bgOpacity: v / 100 })} />
            <SliderField label="좌우 여백" value={s.bgPaddingX} min={0} max={80} format={px} onChange={(v) => set({ bgPaddingX: v })} />
            <SliderField label="위아래 여백" value={s.bgPaddingY} min={0} max={60} format={px} onChange={(v) => set({ bgPaddingY: v })} />
            <SliderField label="모서리 둥글기" value={s.bgRadius} min={0} max={40} format={px} onChange={(v) => set({ bgRadius: v })} />
          </>
        )}
      </Section>

      <Section title="위치 · 줄바꿈">
        <Segmented label="세로 위치" value={s.verticalPosition} options={[['top', '위'], ['middle', '가운데'], ['bottom', '아래']]} onChange={(v) => set({ verticalPosition: v })} />
        <Segmented label="정렬" value={s.alignment} options={[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]} onChange={(v) => set({ alignment: v })} />
        <SliderField label="화면 끝에서 떨어진 거리" value={s.marginBottom} min={0} max={400} format={px} onChange={(v) => set({ marginBottom: v })} />
        <SliderField label="한 줄 최대 글자 수" value={s.maxCharsPerLine} min={8} max={40} hint="이보다 길면 자동으로 줄을 바꿉니다." onChange={(v) => set({ maxCharsPerLine: v })} />
        <Segmented label="최대 줄 수" value={s.maxLines} options={[[1, '1줄'], [2, '2줄'], [3, '3줄']]} onChange={(v) => set({ maxLines: v })} />
      </Section>
    </fieldset>
  );
}
