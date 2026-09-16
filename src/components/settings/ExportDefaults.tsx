'use client';

import { useEffect, useState } from 'react';
import { Section } from '@/components/ui/field';
import { Label, NativeSelect } from '@/components/ui/misc';
import { EXPORT_PRESETS } from '@/lib/encode/presets';
import { settings, type EncoderPreference } from '@/lib/settings';

const ENCODERS: { id: EncoderPreference; label: string; hint: string }[] = [
  { id: 'auto', label: '자동 (권장)', hint: '가능하면 그래픽카드로 빠르게, 안 되면 예비 인코더로 자동 전환합니다.' },
  { id: 'webcodecs', label: '빠른 인코더 (WebCodecs)', hint: 'Chrome·Edge에서 그래픽카드를 써서 빠릅니다.' },
  { id: 'ffmpeg-wasm', label: '예비 인코더 (ffmpeg)', hint: '어느 브라우저에서나 동작하지만 5~10배 느립니다.' },
];

export function ExportDefaults() {
  const [preset, setPreset] = useState('youtube-1080p');
  const [encoder, setEncoder] = useState<EncoderPreference>('auto');
  useEffect(() => {
    setPreset(settings.getExportPreset());
    setEncoder(settings.getEncoder());
  }, []);

  return (
    <Section title="내보내기 기본값">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="default-preset">기본 프리셋</Label>
          <NativeSelect id="default-preset" value={preset} onChange={(e) => { setPreset(e.target.value); settings.setExportPreset(e.target.value); }}>
            {EXPORT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="default-encoder">인코더 (영상을 다시 압축하는 엔진)</Label>
          <NativeSelect id="default-encoder" value={encoder} onChange={(e) => { const v = e.target.value as EncoderPreference; setEncoder(v); settings.setEncoder(v); }}>
            {ENCODERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{ENCODERS.find((x) => x.id === encoder)?.hint}</p>
        </div>
      </div>
    </Section>
  );
}
