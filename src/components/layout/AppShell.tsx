'use client';

// 로그인 화면(격리 헤더가 없는 페이지)만 빼고 좌측 메뉴를 붙인다.
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LOGIN_PATH } from '@/lib/firebase/config';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (path === LOGIN_PATH) return <main id="main">{children}</main>;
  return (
    <div className="flex">
      <Sidebar />
      <main id="main" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
