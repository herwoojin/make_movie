'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addClipAtPlayhead } from '@/lib/editor/actions';
import { useProjectStore } from '@/store/projectStore';
import { SubtitleFileMenu } from './SubtitleFileMenu';
import { TranscribeBox } from './TranscribeBox';

export function SubtitlePanel() {
  const clipCount = useProjectStore((s) => s.doc.clips.length);
  const wordCount = useProjectStore((s) => s.doc.words.filter((w) => !w.deleted).length);
  return (
    <>
      <TranscribeBox />
      <Button size="sm" variant="secondary" onClick={addClipAtPlayhead}>
        <Plus /> 재생 위치에 자막 추가
      </Button>
      {clipCount > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          자막 클립 {clipCount}개 · 단어 {wordCount}개. 가운데 목록에서 단어의 ⊗를 눌러 지우세요.
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">자막이 아직 없습니다. 위에서 자막을 만들거나, 자막 파일을 불러오세요.</p>
      )}
      <SubtitleFileMenu />
    </>
  );
}
