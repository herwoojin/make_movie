'use client';

import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { attachOrphanToNearest, renumberCues } from '@/lib/subtitle/model';
import { useProjectStore } from '@/store/projectStore';

/** 컷으로 원래 위치가 사라진 자막: 삭제하지 않고 사용자에게 처리 방법을 고르게 한다 */
export function OrphanCues() {
  const orphans = useProjectStore((s) => s.doc.cues.filter((c) => c.orphan));
  if (orphans.length === 0) return null;
  const edit = useProjectStore.getState().edit;

  return (
    <Section title={`잘린 구간에 걸린 자막 ${orphans.length}개`} description="컷 편집으로 원래 위치가 잘려 나간 자막입니다. 지우지 않고 남겨 두었으니 처리 방법을 골라 주세요.">
      <ul className="space-y-1.5">
        {orphans.map((c) => (
          <li key={c.id} className="space-y-1 rounded-md border border-dashed border-red-400/50 p-2 text-xs">
            <p className="text-sm">{c.text}</p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" className="h-7" onClick={() => edit('고아 자막 붙이기', (d) => {
                const i = d.cues.findIndex((x) => x.id === c.id);
                if (i >= 0) d.cues[i] = attachOrphanToNearest(d.cues[i], d.edl);
              })}>가까운 곳에 붙이기</Button>
              <Button size="sm" variant="secondary" className="h-7" onClick={() => edit('잘린 구간 살리기', (d) => {
                for (const seg of d.edl) {
                  if (!seg.enabled && seg.sourceStartMs < c.sourceEndMs && seg.sourceEndMs > c.sourceStartMs) seg.enabled = true;
                }
              })}>원래 구간 살리기</Button>
              <Button size="sm" variant="ghost" className="h-7 text-red-400" onClick={() => edit('고아 자막 삭제', (d) => {
                d.cues = renumberCues(d.cues.filter((x) => x.id !== c.id));
              })}>삭제</Button>
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" onClick={() => edit('고아 자막 모두 삭제', (d) => { d.cues = renumberCues(d.cues.filter((x) => !x.orphan)); })}>모두 삭제</Button>
    </Section>
  );
}
