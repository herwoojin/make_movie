'use client';

import type { StyleValues } from '@/types/models';
import { Section, SliderField } from '@/components/ui/field';
import { Label, NativeSelect } from '@/components/ui/misc';
import { ColorField, Segmented } from '@/components/ui/segmented';
import { useProjectStore } from '@/store/projectStore';

const FONTS: [string, string][] = [['Pretendard', '프리텐다드 (기본)'], ['sans-serif', '시스템 고딕'], ['serif', '시스템 명조']];
const WEIGHTS: [number, string][] = [[400, '보통'], [500, '중간'], [700, '굵게'], [800, '더 굵게'], [900, '가장 굵게']];

/** 슬라이더는 드래그하는 동안 수십 번 바뀌므로 되돌리기 기록 없이 반영한다 */
function set(patch: Partial<StyleValues>): void {
  useProjectStore.getState().edit('자막 스타일', (d) => { Object.assign(d.style, patch); }, { history: false });
}

const px = (v: number) => `${v}px`;

export function StyleControls() {
  const s = useProjectStore((st) => st.doc.style);
  return (
    <>
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
        <ColorField label="글자 색" value={s.color} onChange={(v) => set({ color: v })} />
      </Section>

      <Section title="외곽선 · 그림자" description="밝은 화면에서도 글자가 잘 보이게 합니다.">
        <ColorField label="외곽선 색" value={s.outlineColor} onChange={(v) => set({ outlineColor: v })} />
        <SliderField label="외곽선 두께" value={s.outlineWidth} min={0} max={20} format={px} onChange={(v) => set({ outlineWidth: v })} />
        <SliderField label="그림자 번짐" value={s.shadowBlur} min={0} max={30} format={px} onChange={(v) => set({ shadowBlur: v })} />
      </Section>

      <Section title="배경 박스" description="불투명도를 0보다 크게 하면 글자 뒤에 상자가 생깁니다.">
        <ColorField label="박스 색" value={s.bgColor} onChange={(v) => set({ bgColor: v })} />
        <SliderField label="불투명도" value={Math.round(s.bgOpacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => set({ bgOpacity: v / 100 })} />
        {s.bgOpacity > 0 && (
          <>
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
    </>
  );
}
