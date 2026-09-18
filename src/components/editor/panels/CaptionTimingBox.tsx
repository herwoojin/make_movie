'use client';

// 자막을 말보다 조금 먼저 띄워 읽을 시간을 준다. 자막 내용·단어 시간은 그대로 두고 "보이는 시각"만 당긴다.
import { Section, SliderField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { CAPTION_LEAD_PRESETS, MAX_CAPTION_LEAD_MS } from '@/lib/subtitle/clipCues';
import { useProjectStore } from '@/store/projectStore';

const PRESET_LABELS: Record<number, string> = { 0: '끄기', 200: '0.2초', 300: '0.3초 (권장)', 500: '0.5초' };

export function CaptionTimingBox() {
  const lead = useProjectStore((s) => s.doc.view.captionLeadMs);
  const set = (captionLeadMs: number) => useProjectStore.getState().setView({ captionLeadMs });

  return (
    <Section
      title="자막 타이밍"
      description="말이 시작되기 조금 전에 자막을 띄워 읽을 시간을 줍니다. 앞 자막과 겹치지 않게 맞추며, 미리보기·자막 넣은 영상·자막 파일(SRT/VTT)에 똑같이 적용됩니다."
    >
      <Segmented
        label="자막 먼저 보여주기"
        value={lead}
        options={CAPTION_LEAD_PRESETS.map((v) => [v, PRESET_LABELS[v]] as [number, string])}
        onChange={set}
      />
      <SliderField
        label="직접 조절"
        value={lead}
        min={0}
        max={MAX_CAPTION_LEAD_MS}
        step={50}
        format={(v) => (v === 0 ? '끔' : `${(v / 1000).toFixed(2)}초 먼저`)}
        onChange={set}
      />
      <p className="text-xs text-muted-foreground">
        {lead > 0
          ? `자막이 말보다 ${(lead / 1000).toFixed(2)}초 먼저 나타납니다. 자막 글자와 단어 칩의 시간은 바뀌지 않습니다.`
          : '지금은 말이 시작될 때 자막이 함께 나타납니다.'}
      </p>
    </Section>
  );
}
