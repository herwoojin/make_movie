'use client';

// 사이드카 상태는 이 훅으로만 읽는다 (AGENTS v2 규칙). 컴포넌트가 직접 fetch 하지 않는다.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { sidecar, type SidecarFeatures, type SidecarHealth, type SidecarStatus } from './client';

export interface SidecarState {
  status: SidecarStatus;
  health: SidecarHealth | null;
  features: SidecarFeatures;
  ready: boolean;
  recheck: () => void;
}

const NO_FEATURES: SidecarFeatures = { ytdlp: false, ffmpeg: false, translate: false, tts: false };

/** 렌더마다 새 함수가 되지 않도록 밖에 둔다 (구독·effect 의존성으로 쓰인다) */
const recheck = () => { void sidecar.check(true); };

export function useSidecar(): SidecarState {
  const live = useSyncExternalStore(
    (cb) => sidecar.subscribe(cb),
    () => sidecar.status,
    () => 'unknown' as SidecarStatus,
  );
  // 서버에서 그린 화면과 첫 렌더가 달라지지 않도록, 붙은 뒤부터 실제 상태를 쓴다
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 화면이 처음 뜰 때 한 번만 확인한다. 실패해도 아무 것도 띄우지 않는다
    void sidecar.check();
  }, []);

  const status = mounted ? live : 'unknown';
  return {
    status,
    health: status === 'connected' ? sidecar.health : null,
    features: status === 'connected' ? sidecar.features() : NO_FEATURES,
    ready: status === 'connected',
    recheck,
  };
}
