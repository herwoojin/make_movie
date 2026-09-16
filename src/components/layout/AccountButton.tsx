'use client';

import { LogIn, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { signOutUser } from '@/lib/firebase/auth';
import { LOGIN_PATH } from '@/lib/firebase/config';
import { useAuth } from '@/lib/firebase/useAuth';

export function AccountButton() {
  const path = usePathname();
  const { user, ready } = useAuth();
  if (!ready || path === LOGIN_PATH) return null;

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
        ) : null}
        <span className="hidden max-w-[10rem] truncate sm:inline">{user.displayName ?? user.email}</span>
        <Button size="sm" variant="ghost" onClick={() => void signOutUser()} aria-label="로그아웃" title="로그아웃">
          <LogOut />
        </Button>
      </div>
    );
  }

  // 일반 <a>로 전체 페이지 이동: 로그인 페이지는 격리 헤더가 없는 새 문서로 열려야 팝업 로그인이 된다
  return (
    <a href={`${LOGIN_PATH}?next=${encodeURIComponent(path ?? '/')}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <LogIn /> 로그인
    </a>
  );
}
