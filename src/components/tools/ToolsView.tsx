import Link from 'next/link';
import { TOOLS } from '@/lib/tools';

export function ToolsView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">도구함</h1>
        <p className="text-sm text-muted-foreground">편집기와 따로 쓰는 작은 도구들입니다. 모든 파일은 이 컴퓨터 안에서만 처리됩니다.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TOOLS.map(({ id, label, desc, icon: Icon }) => (
          <li key={id}>
            <Link href={`/tools/${id}`} className="block rounded-xl border bg-card p-3 transition-colors hover:border-primary">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
