import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AutoEditRoute } from '@/components/pipeline/AutoEditRoute';

export const metadata: Metadata = { title: '1단계 · 음성 자동편집' };

export default function AutoEditPage() {
  return (
    <Suspense>
      <AutoEditRoute />
    </Suspense>
  );
}
