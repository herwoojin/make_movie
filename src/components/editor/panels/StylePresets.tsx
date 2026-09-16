'use client';

import { Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { StylePresetRecord } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input } from '@/components/ui/misc';
import { deleteRemotePreset } from '@/lib/firebase/sync';
import { settings } from '@/lib/settings';
import { BUILT_IN_PRESETS, deletePreset, listPresets, savePreset, styleValuesOf } from '@/lib/subtitle/presets';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

function swatchStyle(p: StylePresetRecord): React.CSSProperties {
  const s = p.style;
  const hex = s.bgColor.replace('#', '');
  const n = parseInt(hex.length === 6 ? hex : '000000', 16);
  return {
    color: s.color,
    fontWeight: s.fontWeight,
    WebkitTextStroke: s.outlineWidth > 0 ? `${Math.min(2, s.outlineWidth / 4)}px ${s.outlineColor}` : undefined,
    background: s.bgOpacity > 0 ? `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${s.bgOpacity})` : 'repeating-conic-gradient(#666 0 25%, #999 0 50%) 50% / 10px 10px',
  };
}

export function StylePresets() {
  const [presets, setPresets] = useState<StylePresetRecord[]>(BUILT_IN_PRESETS);
  const [name, setName] = useState('');
  const refresh = useCallback(() => { listPresets().then(setPresets).catch(() => undefined); }, []);
  useEffect(refresh, [refresh]);

  const apply = (p: StylePresetRecord) => {
    useProjectStore.getState().edit(`스타일 프리셋: ${p.name}`, (d) => { Object.assign(d.style, p.style); });
    settings.setLastPresetId(p.id);
  };

  const save = async () => {
    const saved = await savePreset(name, styleValuesOf(useProjectStore.getState().doc.style));
    setName('');
    refresh();
    useUiStore.getState().toast({ kind: 'success', title: `"${saved.name}" 프리셋을 저장했습니다.`, hint: '다음 영상에서도 바로 불러올 수 있습니다. 로그인하면 다른 기기와도 맞출 수 있습니다.' });
  };

  return (
    <Section title="프리셋" description="눌러서 한 번에 적용합니다.">
      <ul className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <li key={p.id} className="relative">
            <button type="button" onClick={() => apply(p)} className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs hover:border-primary">
              <span className="rounded px-1.5 py-0.5 text-base leading-none" style={swatchStyle(p)} aria-hidden>가나</span>
              <span className="truncate">{p.name}</span>
            </button>
            {!p.builtIn && (
              <button type="button" aria-label={`${p.name} 프리셋 삭제`} className="absolute -right-1 -top-1 rounded-full bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void deletePreset(p.id).then(() => {
                    refresh();
                    // 로그인 상태면 서버 문서도 지워, 다음 동기화 때 되살아나지 않게 한다
                    if (p.remoteId) void deleteRemotePreset(p.remoteId).catch(() => undefined);
                  });
                }}>
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Input className="h-8" placeholder="프리셋 이름 (예: 내 강의용)" value={name} onChange={(e) => setName(e.target.value)} aria-label="프리셋 이름" />
        <Button size="sm" type="submit" variant="secondary"><Save /> 지금 스타일 저장</Button>
      </form>
    </Section>
  );
}
