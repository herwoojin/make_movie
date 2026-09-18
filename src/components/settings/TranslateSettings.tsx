'use client';

// 번역 엔진 키 (BYOK). 키는 이 브라우저에만 저장되고 서버로 보내지 않는다.
import { useEffect, useState } from 'react';
import { Section } from '@/components/ui/field';
import { Input, Label, NativeSelect } from '@/components/ui/misc';
import { settings, type TranslateEnginePreference } from '@/lib/settings';
import { TRANSLATE_ENGINES } from '@/lib/translate/types';

export function TranslateSettings() {
  const [engine, setEngine] = useState<TranslateEnginePreference>('gemini');
  const [gemini, setGemini] = useState('');
  const [deepl, setDeepl] = useState('');
  const [glossary, setGlossary] = useState('');

  useEffect(() => {
    setEngine(settings.getTranslateEngine());
    setGemini(settings.getGeminiKey());
    setDeepl(settings.getDeeplKey());
    setGlossary(settings.getGlossaryText());
  }, []);

  return (
    <Section title="번역 (해외 영상 자막)" description="자막 글자만 번역 서비스로 전송됩니다. 영상·소리는 절대 올라가지 않습니다.">
      <div className="space-y-1">
        <Label htmlFor="tr-engine-default" className="text-xs">기본 번역 엔진</Label>
        <NativeSelect id="tr-engine-default" className="h-9" value={engine}
          onChange={(e) => { const v = e.target.value as TranslateEnginePreference; setEngine(v); settings.setTranslateEngine(v); }}>
          {Object.values(TRANSLATE_ENGINES).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </NativeSelect>
        <p className="text-[11px] text-muted-foreground">{TRANSLATE_ENGINES[engine].description}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="key-gemini" className="text-xs">Gemini API 키</Label>
        <Input id="key-gemini" type="password" autoComplete="off" placeholder="AIza..." value={gemini}
          onChange={(e) => { setGemini(e.target.value); settings.setGeminiKey(e.target.value); }} />
        <p className="text-[11px] text-muted-foreground">Google AI Studio에서 무료로 발급받을 수 있습니다.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="key-deepl" className="text-xs">DeepL API 키</Label>
        <Input id="key-deepl" type="password" autoComplete="off" placeholder="xxxxxxxx:fx" value={deepl}
          onChange={(e) => { setDeepl(e.target.value); settings.setDeeplKey(e.target.value); }} />
        <p className="text-[11px] text-muted-foreground">무료 키는 :fx로 끝납니다. 브라우저에서 직접 연결이 막히면 내 컴퓨터 도우미가 대신 부릅니다.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="glossary-default" className="text-xs">기본 용어 지정</Label>
        <Input id="glossary-default" placeholder="Sunburst=선버스트, fidelity=정확도" value={glossary}
          onChange={(e) => { setGlossary(e.target.value); settings.setGlossaryText(e.target.value); }} />
      </div>

      <p className="text-xs text-muted-foreground">키는 이 브라우저(localStorage)에만 저장됩니다. 공용 컴퓨터에서는 다 쓰고 비워 주세요.</p>
    </Section>
  );
}
