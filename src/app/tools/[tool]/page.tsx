import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ToolHost } from '@/components/tools/ToolHost';
import { getTool, TOOLS } from '@/lib/tools';

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.id }));
}

export function generateMetadata({ params }: { params: { tool: string } }): Metadata {
  return { title: getTool(params.tool)?.label ?? '도구함' };
}

export default function ToolPage({ params }: { params: { tool: string } }) {
  const tool = getTool(params.tool);
  if (!tool) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div>
        <Link href="/tools" className="text-xs text-muted-foreground hover:text-foreground">← 도구함</Link>
        <h1 className="mt-1 text-2xl font-bold">{tool.label}</h1>
        <p className="text-sm text-muted-foreground">{tool.desc} · 파일은 이 컴퓨터 안에서만 처리됩니다.</p>
      </div>
      <ToolHost tool={tool.id} />
    </div>
  );
}
