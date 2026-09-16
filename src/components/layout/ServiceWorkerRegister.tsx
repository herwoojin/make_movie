'use client';

import { useEffect } from 'react';

/** PWA 오프라인 셸. 개발 중에는 캐시가 코드 변경을 가려서 헷갈리므로 운영 빌드에서만 등록한다 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
