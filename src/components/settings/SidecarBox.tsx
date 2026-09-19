'use client';

// 내 컴퓨터 도우미(사이드카) 연결. 없어도 앱은 그대로 동작하므로 "선택"이라는 점을 분명히 한다.
import { Check, Copy, Plug, RefreshCw } from 'lucide-react';
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

/** 아직 npm에 올리지 않아 npx로는 받을 수 없다 — 프로젝트 폴더에서 바로 켠다 */
const HELPER_COMMAND = 'npm run helper';

export function SidecarBox() {
  const { status, health, features, recheck } = useSidecar();
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(HELPER_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 직접 선택해서 복사하면 된다
    }
  };
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
          onChange={(e) => { setToken(e.target.value); settings.setSidecarToken(e.target.value); }}
          onBlur={() => { if (token.trim()) recheck(); }} />
        <p className="text-[11px] text-muted-foreground">
          도우미는 {SIDECAR_ORIGIN} 에서만 듣고, 토큰이 맞는 요청만 받습니다. 토큰은 이 브라우저에만 저장됩니다.
        </p>
      </div>

      <div className="space-y-1.5 rounded-md border p-2.5 text-xs">
        <p className="font-medium">도우미 켜는 법</p>
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>터미널을 열고 편집ON 프로젝트 폴더에서 아래 명령을 실행합니다.</li>
        </ol>
        <div className="flex items-center gap-1.5">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-foreground">{HELPER_COMMAND}</code>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? '복사됨' : '복사'}</Button>
        </div>
        <ol start={2} className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>터미널에 나온 <b className="text-foreground">토큰: …</b> 줄을 복사해 위 “연결 토큰” 칸에 붙여넣습니다.</li>
          <li>“다시 확인”을 누르면 연결됩니다. 터미널 창은 쓰는 동안 켜 두세요.</li>
        </ol>
        <p className="text-muted-foreground">
          배포한 사이트(https)에서 쓸 때는 주소를 허용해 줘야 합니다:{' '}
          <code className="rounded bg-muted px-1">EDITON_ORIGINS=https://내사이트.netlify.app npm run helper</code>
        </p>
      </div>
    </Section>
  );
}
