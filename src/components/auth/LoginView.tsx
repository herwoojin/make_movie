'use client';

import { CloudOff, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/misc';
import { signInWithGoogle, signOutUser } from '@/lib/firebase/auth';
import { safeNextPath } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/useAuth';
import { useUiStore } from '@/store/uiStore';

const RELOAD_FLAG = 'editon.loginReload';

/** 앱으로 돌아갈 때는 전체 새로고침 — 격리 헤더가 있는 문서로 다시 열려야 고속 처리 모드가 켜진다 */
function goBack(): void {
  window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get('next')));
}

export function LoginView() {
  const { user, ready, configured } = useAuth();
  const [busy, setBusy] = useState(false);
  const [stuckIsolated, setStuckIsolated] = useState(false);

  useEffect(() => {
    if (!window.crossOriginIsolated) {
      sessionStorage.removeItem(RELOAD_FLAG);
      return;
    }
    // 앱 안에서 링크로 들어오면 문서가 격리된 채로 남아 팝업 로그인이 불가 → 헤더 없는 문서로 한 번만 다시 연다
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') {
      setStuckIsolated(true);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  }, []);

  const login = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      goBack();
    } catch (e) {
      useUiStore.getState().showError(e);
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">로그인 (선택)</h1>
        <p className="text-sm text-muted-foreground">
          로그인하지 않아도 모든 편집 기능을 쓸 수 있습니다. Google 계정으로 로그인하면 자막 스타일 프리셋과 추임새 사전을 다른 컴퓨터와 맞출 수 있습니다.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>올라가는 것: 자막 스타일 프리셋, 추임새 사전, (원할 때만) 프로젝트 이름·길이 기록</p>
          <p>절대 올라가지 않는 것: 영상, 오디오, 자막 내용, 얼굴 정보</p>
        </div>
      </div>

      {stuckIsolated && (
        <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          이 페이지에 격리 헤더(COOP)가 붙어 있어 로그인 창을 열 수 없습니다. 사이트 설정(next.config.js의 /login 제외 규칙)을 확인해 주세요.
        </p>
      )}

      {!configured ? (
        <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          이 사이트에는 Firebase가 설정되지 않았습니다. 프리셋과 사전은 이 브라우저에 저장됩니다.
        </div>
      ) : !ready ? (
        <p className="text-sm text-muted-foreground">로그인 상태 확인 중…</p>
      ) : user ? (
        <div className="space-y-3">
          <p className="text-sm"><b>{user.displayName ?? user.email}</b> 계정으로 로그인되어 있습니다.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={goBack}>편집ON으로 돌아가기</Button>
            <Button variant="outline" onClick={() => void signOutUser()}><LogOut /> 로그아웃</Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" disabled={busy || stuckIsolated} onClick={() => void login()}>
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? '로그인 창에서 계정을 선택해 주세요…' : 'Google 계정으로 로그인'}
        </Button>
      )}

      {!user && (
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={goBack}>
          로그인하지 않고 돌아가기
        </button>
      )}
    </Card>
  );
}
