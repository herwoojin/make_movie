'use client';

// 계정별로 나눠 보여 주는 이유와 방법 안내.
// - 로그아웃 상태: 계정을 나누기 전에 만든 작업은 로그인해야 보인다 / 로그인하지 않고 만든 작업은 이 브라우저의 누구나 본다
// - 로그인 상태: 로그인하기 전에 이 브라우저에서 만든 작업을 내 계정으로 가져올 수 있다 (자동으로 가져오지 않는다 — 공용 컴퓨터일 수 있다)
import { LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isFirebaseConfigured, LOGIN_PATH } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/useAuth';
import { claimRows, countProjects, GUEST, LEGACY, ownerReady } from '@/lib/storage/owner';
import { useUiStore } from '@/store/uiStore';

export function OwnerNotice({ showGuestWarning = false }: { showGuestWarning?: boolean }) {
  const { user, ready } = useAuth();
  const path = usePathname();
  const [hidden, setHidden] = useState(0);
  const [guest, setGuest] = useState(0);

  useEffect(() => {
    if (!ready || !isFirebaseConfigured()) return;
    let alive = true;
    void ownerReady().then(async (owner) => {
      const [legacy, guestCount] = await Promise.all([countProjects(LEGACY), owner === GUEST ? 0 : countProjects(GUEST)]);
      if (!alive) return;
      setHidden(owner === GUEST ? legacy : 0);
      setGuest(guestCount);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [ready, user?.uid]);

  if (!ready || !isFirebaseConfigured()) return null;

  const adopt = async () => {
    if (!user) return;
    const moved = await claimRows(GUEST, user.uid);
    useUiStore.getState().toast({ kind: 'success', title: `작업 ${moved}개를 내 계정으로 가져왔습니다.` });
    location.reload();
  };

  if (user && guest > 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
        <p className="min-w-0 flex-1">
          로그인하기 전에 이 브라우저에서 만든 작업이 <b>{guest}개</b> 있습니다. 내 작업이 맞으면 계정으로 가져오세요.
          <span className="block text-xs text-muted-foreground">가져오면 로그아웃했을 때 다른 사람에게 보이지 않습니다.</span>
        </p>
        <Button size="sm" onClick={() => void adopt()}><UserPlus /> 내 계정으로 가져오기</Button>
      </div>
    );
  }

  if (!user && hidden > 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1">이전에 만든 작업 {hidden}개는 로그인한 계정에서만 보입니다.</p>
        <Button size="sm" variant="outline" asChild>
          <a href={`${LOGIN_PATH}?next=${encodeURIComponent(path ?? '/')}`}><LogIn /> 로그인</a>
        </Button>
      </div>
    );
  }

  if (!user && showGuestWarning) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        로그인하지 않고 만든 작업은 이 브라우저를 쓰는 누구나 볼 수 있습니다. 공용 컴퓨터라면 로그인한 뒤 작업하세요.
      </p>
    );
  }
  return null;
}
