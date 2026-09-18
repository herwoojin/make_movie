'use client';

import { Menu, Plug } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isActivePath, NAV_SECTIONS } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // 화면을 옮기면 좁은 화면에서 열어 둔 메뉴는 닫는다
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen((v) => !v)}
        className="fixed left-2 top-14 z-40 rounded-md border bg-background p-2 shadow lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden />
        <span className="sr-only">메뉴 {open ? '닫기' : '열기'}</span>
      </button>

      <nav
        id="app-sidebar"
        aria-label="기능 메뉴"
        className={cn(
          'scrollbar-thin z-30 w-60 shrink-0 space-y-4 overflow-y-auto border-r bg-background p-3',
          'fixed inset-y-12 left-0 transition-transform lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] lg:translate-x-0',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
      >
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? `s${i}`} className={cn(i > 0 && 'border-t pt-3')}>
            {section.title && <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(path, item.href);
                const label = (
                  <>
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.sidecar && <Plug className="ml-auto h-3 w-3 shrink-0 text-amber-400" aria-label="내 컴퓨터 도우미 필요" />}
                  </>
                );
                return (
                  <li key={item.href}>
                    {item.planned ? (
                      <span
                        aria-disabled
                        title="곧 추가됩니다"
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/50"
                      >
                        {label}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                          active ? 'bg-primary/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
