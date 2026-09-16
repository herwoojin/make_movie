import type { Metadata } from 'next';
import { ToolsView } from '@/components/tools/ToolsView';

export const metadata: Metadata = { title: '도구함' };

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ToolsView />
    </div>
  );
}
