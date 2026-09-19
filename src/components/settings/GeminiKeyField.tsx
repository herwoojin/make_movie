'use client';

// Gemini 키 입력칸 — 설정 화면과 번역 화면(키가 틀렸을 때)에서 함께 쓴다.
// 입력하는 즉시 이 브라우저에 저장되고, "저장하고 키 확인"을 누르면 구글에 실제로 되는 키인지 물어본다.
// 키 칸은 내용이 가려져 있어 옛 키 뒤에 이어 붙이는 실수가 잦으므로, 저장된 키의 앞뒤 4자를 늘 보여 준다.
import { CheckCircle2, Eye, EyeOff, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/misc';
import { toAppError } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { prepareGemini } from '@/lib/translate/gemini';
import { keyCandidates, keyShapeProblem, maskKey } from '@/lib/translate/geminiKey';

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; text: string }
  | { state: 'bad'; text: string; hint?: string }
  | { state: 'unknown'; text: string };

export function GeminiKeyField({ onVerified }: { onVerified?: () => void }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  useEffect(() => {
    setValue(settings.getGeminiKey());
  }, []);

  const change = (v: string) => {
    setValue(v);
    settings.setGeminiKey(v);
    setCheck({ state: 'idle' });
  };

  const verify = async () => {
    settings.setGeminiKey(value);
    setCheck({ state: 'checking' });
    try {
      const setup = await prepareGemini();
      // 이어 붙은 키 중 되는 것만 남겼으면 칸에도 반영
      setValue(settings.getGeminiKey());
      if (!setup.verified) {
        setCheck({ state: 'unknown', text: '구글에 연결하지 못해 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.' });
        return;
      }
      setCheck({ state: 'ok', text: `쓸 수 있는 키입니다 (${maskKey(setup.key)}) — ${setup.models[0]} 모델로 번역합니다.` });
      onVerified?.();
    } catch (e) {
      const err = toAppError(e);
      setCheck({ state: 'bad', text: err.message, hint: err.hint });
    }
  };

  const candidates = keyCandidates(value);
  const shape = keyShapeProblem(value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">Gemini API 키</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input id={id} type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="AIza로 시작하는 키를 붙여넣기"
            value={value} onChange={(e) => change(e.target.value)} className="pr-9" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? '키 가리기' : '키 보기'}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button type="button" variant="secondary" disabled={!value.trim() || check.state === 'checking'} onClick={() => void verify()}>
          {check.state === 'checking' && <Loader2 className="animate-spin" />} 저장하고 키 확인
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {candidates.length === 0
          ? 'Google AI Studio에서 무료로 발급받을 수 있습니다. 입력하면 바로 이 브라우저에 저장됩니다.'
          : candidates.length === 1
            ? `저장됨: ${maskKey(candidates[0])} (${candidates[0].length}자) · 이 브라우저에만 저장, 입력하면 바로 반영됩니다.`
            : `저장됨: 키 ${candidates.length}개가 이어 붙어 있음 (${candidates.map(maskKey).join(', ')})`}
      </p>
      {shape && (
        <p className="flex items-start gap-1 text-[11px] text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {shape}
        </p>
      )}
      {check.state === 'ok' && (
        <p role="status" className="flex items-start gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {check.text}
        </p>
      )}
      {check.state === 'bad' && (
        <div role="alert" className="text-xs text-red-400">
          <p className="flex items-start gap-1"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {check.text}</p>
          {check.hint && <p className="mt-0.5 text-muted-foreground">{check.hint}</p>}
        </div>
      )}
      {check.state === 'unknown' && <p className="text-xs text-muted-foreground">{check.text}</p>}
    </div>
  );
}
