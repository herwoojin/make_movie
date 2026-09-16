'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-14 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? AlertTriangle : t.kind === 'success' ? CheckCircle2 : Info;
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto rounded-lg border bg-card p-3 shadow-xl',
              t.kind === 'error' && 'border-red-500/50',
              t.kind === 'success' && 'border-emerald-500/50',
            )}
          >
            <div className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.kind === 'error' ? 'text-red-400' : t.kind === 'success' ? 'text-emerald-400' : 'text-primary')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.hint && <p className="mt-1 text-xs text-muted-foreground">👉 {t.hint}</p>}
                {t.action && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
                    {t.action.label}
                  </Button>
                )}
              </div>
              <button type="button" aria-label="알림 닫기" onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
