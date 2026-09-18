'use client';

// "1 자동편집 · 2 자막·영상 편집" — 지금 어느 단계인지 항상 보이게 (PRD-v2 F-02-4)
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { currentStage } from '@/lib/nav';
import { settings } from '@/lib/settings';
import { cn } from '@/lib/utils';

const STEPS = [
  { step: 1 as const, label: '자동편집', href: '/auto-edit' },
  { step: 2 as const, label: '자막·영상 편집', href: '/editor' },
];

export function StepNav() {
  const path = usePathname();
  const stage = currentStage(path);
  const [lastProjectId, setLastProjectId] = useState('');
  useEffect(() => setLastProjectId(settings.getLastProjectId()), [path]);

  if (stage === null) return null;

  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="편집 단계">
      {STEPS.map(({ step, label, href }, i) => {
        const active = stage === step;
        // 2단계는 열어 둔 프로젝트가 있으면 그리로 바로 간다
        const to = step === 2 && lastProjectId ? `/editor/${lastProjectId}` : href;
        return (
          <li key={step} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-muted-foreground">›</span>}
            <Link
              href={to}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 transition-colors',
                active ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', active ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                {step}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
