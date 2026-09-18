'use client';

// 1단계·2단계 화면이 같은 방식으로 프로젝트를 열고 닫도록 모아 둔 훅.
import { useEffect } from 'react';
import { settings } from '@/lib/settings';
import { useProjectStore } from '@/store/projectStore';
import { useTimelineStore } from '@/store/timelineStore';
import { useEditorShortcuts } from './useEditorShortcuts';

export function useProjectSession(projectId: string) {
  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const asset = useProjectStore((s) => s.asset);

  useEffect(() => {
    void useProjectStore.getState().load(projectId);
    settings.setLastProjectId(projectId);
    return () => useProjectStore.getState().unload();
  }, [projectId]);

  useEffect(() => {
    if (!asset) return;
    useTimelineStore.getState().reset();
    useTimelineStore.getState().setDuration(asset.durationMs);
  }, [asset]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().saveState === 'saved') return;
      void useProjectStore.getState().flush();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEditorShortcuts(status === 'ready');

  return { status, error };
}
