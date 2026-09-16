'use client';

import { FileWarning } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

export function RelinkBanner() {
  const missing = useProjectStore((s) => s.sourceMissing);
  const fileName = useProjectStore((s) => s.asset?.fileName);
  if (!missing) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" role="alert">
      <FileWarning className="h-4 w-4 text-amber-400" />
      <span>브라우저에 보관된 원본 영상을 찾을 수 없습니다. 편집 기록은 남아 있으니 원본 파일 &quot;{fileName}&quot;을 다시 선택해 주세요.</span>
      <label className="ml-auto cursor-pointer rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-black">
        원본 다시 선택
        <input type="file" accept="video/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) useProjectStore.getState().relinkSource(f).catch((err) => useUiStore.getState().showError(err));
        }} />
      </label>
    </div>
  );
}
