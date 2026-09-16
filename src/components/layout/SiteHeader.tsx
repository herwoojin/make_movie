'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LOGIN_PATH } from '@/lib/firebase/config';
import { cn } from '@/lib/utils';
import { AccountButton } from './AccountButton';

const NAV = [
  { href: '/projects', label: '프로젝트' },
  { href: '/tools', label: '도구함' },
  { href: '/settings', label: '설정' },
  { href: '/help', label: '도움말' },
];

/**
 * 로그인 페이지(격리 헤더 없음)에서 앱으로 갈 때는 일반 <a>로 전체 새로고침한다.
 * 클라이언트 이동을 하면 격리되지 않은 문서가 그대로 이어져 고속 처리 모드(SharedArrayBuffer)가 꺼진다.
 */
function NavLink({ href, hard, className, children, ...rest }: { href: string; hard: boolean; className?: string; children: ReactNode; 'aria-current'?: 'page'; 'aria-label'?: string }) {
  return hard
    ? <a href={href} className={className} {...rest}>{children}</a>
    : <Link href={href} className={className} {...rest}>{children}</Link>;
}

export function SiteHeader() {
  const path = usePathname();
  const hard = path === LOGIN_PATH;
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-4 sm:px-4">
      <NavLink href="/" hard={hard} className="flex items-center gap-1.5 text-base font-bold" aria-label="편집ON 처음 화면">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
          <rect width="64" height="64" rx="14" fill="hsl(var(--primary))" />
          <path d="M24 18 L46 32 L24 46 Z" fill="white" />
        </svg>
        <span>편집<span className="text-primary">ON</span></span>
      </NavLink>
      <nav aria-label="주 메뉴" className="flex items-center gap-0.5 overflow-x-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.href}
            href={n.href}
            hard={hard}
            aria-current={path?.startsWith(n.href) ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors',
              path?.startsWith(n.href) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto">
        <AccountButton />
      </div>
    </header>
  );
}
