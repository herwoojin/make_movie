'use client';

// 결과 파일을 어디에 저장할지 (F-11). 브라우저마다 할 수 있는 게 달라서 지금 방식이 무엇인지 그대로 보여 준다.
import { FolderOpen, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { currentMethod, forgetSaveFolder, pickSaveFolder, savedFolderName, supportsFolderPicker, type SaveMethod } from '@/lib/storage/saveTarget';
import { useUiStore } from '@/store/uiStore';

const METHOD_TEXT: Record<SaveMethod, string> = {
  sidecar: '내 컴퓨터 도우미로 원하는 폴더에 바로 저장합니다.',
  'fs-access': '폴더를 한 번 고르면 다음부터 그 폴더에 바로 저장합니다. (Chrome·Edge)',
  download: '이 브라우저는 폴더 지정을 지원하지 않아 기본 다운로드 폴더로 저장합니다.',
};

export function SaveFolderBox() {
  const [method, setMethod] = useState<SaveMethod>('download');
  const [folder, setFolder] = useState<string | null>(null);
  // 브라우저에서만 알 수 있는 값이라 서버 렌더와 어긋나지 않게 붙은 뒤에 확인한다
  const [canPick, setCanPick] = useState(false);

  const refresh = useCallback(() => {
    setMethod(currentMethod());
    setCanPick(supportsFolderPicker());
    savedFolderName().then(setFolder).catch(() => setFolder(null));
  }, []);
  useEffect(refresh, [refresh]);

  const pick = async () => {
    try {
      const name = await pickSaveFolder();
      if (name) {
        setFolder(name);
        useUiStore.getState().toast({ kind: 'success', title: `"${name}" 폴더에 저장합니다.`, hint: '다음 내보내기부터 이 폴더로 바로 들어갑니다.' });
      }
    } catch {
      // 사용자가 폴더 선택을 취소함 — 아무 일도 하지 않는다
    }
    refresh();
  };

  return (
    <Section title="저장 폴더" description={METHOD_TEXT[method]}>
      <p className="text-sm">
        지금 저장 위치: <b>{folder ?? '다운로드 폴더'}</b>
      </p>
      {canPick ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void pick()}><FolderOpen /> {folder ? '폴더 바꾸기' : '폴더 고르기'}</Button>
          {folder && (
            <Button size="sm" variant="ghost" onClick={() => void forgetSaveFolder().then(refresh)}>
              <X /> 폴더 지정 해제
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Chrome·Edge에서는 저장할 폴더를 직접 고를 수 있습니다.</p>
      )}
      <p className="text-xs text-muted-foreground">
        폴더 권한은 이 브라우저에만 남고, 파일은 인터넷으로 전송되지 않습니다.
      </p>
    </Section>
  );
}
