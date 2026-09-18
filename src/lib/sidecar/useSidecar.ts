'use client';

// 사이드카 상태는 이 훅으로만 읽는다 (AGENTS v2 규칙). 컴포넌트가 직접 fetch 하지 않는다.
import { useEffect, useSyncExternalStore } from 'react';
import { sidecar, type SidecarFeatures, type SidecarHealth, type SidecarStatus } from './client';

export interface SidecarState {
  status: SidecarStatus;
  health: SidecarHealth | null;
  features: SidecarFeatures;
  ready: boolean;
  recheck: () => void;
}

const NO_FEATURES: SidecarFeatures = { ytdlp: false, ffmpeg: false, translate: false, tts: false };

export function useSidecar(): SidecarState {
  const status = useSyncExternalStore(
    (cb) => sidecar.subscribe(cb),
    () => sidecar.status,
    () => 'unknown' as SidecarStatus,
  );

  // 화면이 처음 뜰 때 한 번만 확인한다. 실패해도 아무 것도 띄우지 않는다
  useEffect(() => {
    void sidecar.check();
  }, []);

  return {
    status,
    health: sidecar.health,
    features: status === 'connected' ? sidecar.features() : NO_FEATURES,
    ready: status === 'connected',
    recheck: () => { void sidecar.check(true); },
  };
}
