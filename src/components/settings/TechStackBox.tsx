'use client';

// 전역 규칙: 기술 스택 인벤토리를 앱 안에서 언제든 볼 수 있게 한다 (techstack.json 렌더).
import { useState } from 'react';
import techstack from '../../../techstack.json';
import { Section } from '@/components/ui/field';

interface StackItem { name: string; purpose: string; version?: string; config?: string }
interface StackCategory { name: string; items: StackItem[] }

export function TechStackBox() {
  const [open, setOpen] = useState<string | null>(null);
  const data = techstack as { lastUpdated: string; architectureSummary: string; categories: StackCategory[] };
  return (
    <Section title="기술 스택" description={`${data.architectureSummary} (마지막 갱신 ${data.lastUpdated})`}>
      <div id="techStackBox" className="divide-y rounded-md border">
        {data.categories.map((cat) => (
          <div key={cat.name}>
            <button type="button" aria-expanded={open === cat.name} onClick={() => setOpen(open === cat.name ? null : cat.name)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-accent">
              {cat.name}
              <span className="text-xs text-muted-foreground">{cat.items.length}개 {open === cat.name ? '▲' : '▼'}</span>
            </button>
            {open === cat.name && (
              <ul className="space-y-1.5 px-3 pb-3">
                {cat.items.map((item) => (
                  <li key={item.name} className="text-xs">
                    <span className="font-medium text-foreground">{item.name}</span>
                    {item.version && <span className="ml-1 text-muted-foreground">{item.version}</span>}
                    <span className="block text-muted-foreground">{item.purpose}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
