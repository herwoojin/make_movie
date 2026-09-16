'use client';

// 도구함 → 편집기 유입 동선 (T-075): 결과물을 곧바로 편집 프로젝트로 만든다
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createProjectFromFile } from '@/lib/editor/importPipeline';
import { useUiStore } from '@/store/uiStore';

export function useSendToEditor() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const send = async (file: File) => {
    setBusy(true);
    try {
      const { projectId } = await createProjectFromFile(file, () => undefined);
      router.push(`/editor/${projectId}`);
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}
