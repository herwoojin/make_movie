'use client';

// 시작할 때 도우미가 있는지 한 번만 확인한다. 없으면 아무것도 띄우지 않고 웹 전용으로 간다.
import { useEffect } from 'react';
import { sidecar } from '@/lib/sidecar/client';
import { ensureSidecarSaver } from '@/lib/sidecar/saver';

export function SidecarBoot() {
  useEffect(() => {
    ensureSidecarSaver();
    void sidecar.check();
  }, []);
  return null;
}
