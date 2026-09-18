'use client';

// 내 컴퓨터 도우미(사이드카) 연결. 없어도 앱은 그대로 동작하므로 "선택"이라는 점을 분명히 한다.
import { Check, Plug, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input, Label } from '@/components/ui/misc';
import { SIDECAR_ORIGIN } from '@/lib/sidecar/client';
import { useSidecar } from '@/lib/sidecar/useSidecar';
import { settings } from '@/lib/settings';
import { cn } from '@/lib/utils';

const FEATURE_LABELS: Record<string, string> = {
  ytdlp: '유튜브 영상 받기',
  ffmpeg: '내 컴퓨터 ffmpeg',
  translate: '내 컴퓨터 번역',
  tts: '내 목소리 TTS',
};

export function SidecarBox() {
  const { status, health, features, recheck } = useSidecar();
  const [token, setToken] = useState('');
  useEffect(() => setToken(settings.getSidecarToken()), []);

  return (
    <Section
      title="내 컴퓨터 도우미 (선택)"
      description="유튜브 받기·내 컴퓨터 번역·TTS·폴더 저장처럼 브라우저 혼자서는 못 하는 일만 도와주는 작은 프로그램입니다. 없어도 편집 기능은 모두 쓸 수 있습니다."
    >
      <p className="flex items-center gap-2 text-sm">
        <Plug className={cn('h-4 w-4', status === 'connected' ? 'text-emerald-400' : 'text-muted-foreground')} aria-hidden />
        {status === 'connected' ? `연결됨 · ${health?.version ?? ''}` : status === 'checking' ? '확인 중…' : '연결되지 않음 (웹 전용 모드)'}
        <Button size="sm" variant="ghost" onClick={recheck}><RefreshCw /> 다시 확인</Button>
      </p>

      {status === 'connected' && (
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <li key={key} className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5',
              features[key as keyof typeof features] ? 'border-emerald-400/50 text-emerald-300' : 'opacity-50')}>
              {features[key as keyof typeof features] && <Check className="h-3 w-3" aria-hidden />} {label}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <Label htmlFor="sidecar-token" className="text-xs">연결 토큰</Label>
        <Input id="sidecar-token" type="password" autoComplete="off" placeholder="도우미 창에 표시된 토큰" value={token}
          onChange={(e) => { setToken(e.target.value); settings.setSidecarToken(e.target.value); }} />
        <p className="text-[11px] text-muted-foreground">
          도우미는 {SIDECAR_ORIGIN} 에서만 듣고, 토큰이 맞는 요청만 받습니다. 토큰은 이 브라우저에만 저장됩니다.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        설치: 터미널에서 <code className="rounded bg-muted px-1">npx editon-helper</code> 를 실행하면 토큰이 표시됩니다.
      </p>
    </Section>
  );
}
