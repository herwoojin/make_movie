'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label, NativeSelect } from '@/components/ui/misc';
import { settings, type SttEnginePreference } from '@/lib/settings';
import { STT_ENGINES } from '@/lib/stt/types';
import { useUiStore } from '@/store/uiStore';

export function ByokSettings() {
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState('');
  const [agree, setAgree] = useState(false);
  const [engine, setEngine] = useState<SttEnginePreference>('local-whisper');

  useEffect(() => {
    setSaved(!!settings.getGroqKey());
    setEngine(settings.getSttEngine());
  }, []);

  const save = () => {
    settings.setGroqKey(key);
    setSaved(true);
    setKey('');
    setAgree(false);
    useUiStore.getState().toast({ kind: 'success', title: 'API 키를 이 브라우저에 저장했습니다.' });
  };

  return (
    <Section title="음성 인식 (자막 만들기)" description="어떤 엔진으로 음성을 글자로 바꿀지 고릅니다.">
      <div className="space-y-1.5">
        <Label htmlFor="stt-engine">기본 엔진</Label>
        <NativeSelect id="stt-engine" value={engine} onChange={(e) => { const v = e.target.value as SttEnginePreference; setEngine(v); settings.setSttEngine(v); }}>
          {Object.values(STT_ENGINES).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">{STT_ENGINES[engine].description}</p>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4" /> Groq API 키 (내 키 쓰기, 선택)</p>
        <p className="flex items-start gap-1.5 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          키는 이 브라우저에만 저장됩니다. 편집ON 서버로 보내지 않습니다. 단, 이 키로 자막을 만들 때는 오디오가 Groq 서버로 전송됩니다(사용 직전에 다시 알려 드립니다).
        </p>
        {saved ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">저장된 키가 있습니다 (●●●●●●)</span>
            <Button size="sm" variant="destructive" onClick={() => { settings.setGroqKey(''); setSaved(false); }}>키 지우기</Button>
          </div>
        ) : (
          <>
            <Input type="password" autoComplete="off" placeholder="gsk_로 시작하는 키" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Groq API 키" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              이 브라우저에만 저장된다는 것을 확인했습니다.
            </label>
            <Button size="sm" disabled={!agree || key.trim().length < 10} onClick={save}>저장</Button>
            <p className="text-xs text-muted-foreground">무료 키는 console.groq.com 에서 받을 수 있습니다.</p>
          </>
        )}
      </div>
    </Section>
  );
}
