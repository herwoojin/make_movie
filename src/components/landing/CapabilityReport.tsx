'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/misc';
import { CAPABILITY_INFO, CAPABILITY_KEYS, checkEnv, isIosSafari, summarizeEnv, type CapabilityReport as Report } from '@/lib/env/capabilities';
import { cn } from '@/lib/utils';

export function CapabilityReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setReport(checkEnv());
    setIos(isIosSafari());
  }, []);

  if (!report) return <Card className="h-40 animate-pulse" aria-label="브라우저 확인 중" />;
  const summary = summarizeEnv(report, ios);

  return (
    <Card className="overflow-hidden" aria-labelledby="env-title">
      <div className={cn(
        'px-4 py-3',
        summary.level === 'full' && 'bg-emerald-500/10',
        summary.level === 'degraded' && 'bg-amber-500/10',
        summary.level === 'unsupported' && 'bg-red-500/10',
      )}>
        <h2 id="env-title" className="font-semibold">
          {summary.level === 'full' ? '✅' : summary.level === 'degraded' ? '⚠️' : '❌'} 이 브라우저 진단: {summary.title}
        </h2>
        {!report.crossOriginIsolated && (
          <p className="mt-1 text-sm text-amber-300">고속 처리 모드가 꺼져 있어 예비 인코더가 한 코어만 씁니다. 새로고침해도 계속되면 Chrome·Edge 최신 버전을 써 주세요.</p>
        )}
      </div>
      <ul className="divide-y">
        {CAPABILITY_KEYS.map((k) => (
          <li key={k} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            <span aria-hidden className="text-base">{report[k] ? '✅' : '❌'}</span>
            <div className="min-w-0">
              <p className="font-medium">
                {CAPABILITY_INFO[k].label}
                <span className="sr-only">{report[k] ? ' 지원됨' : ' 지원 안 됨'}</span>
              </p>
              <p className="text-xs text-muted-foreground">{report[k] ? CAPABILITY_INFO[k].why : CAPABILITY_INFO[k].missing}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
