// 사이드카가 켜져 있으면 저장 경로 1순위가 된다 (F-11). saveTarget이 이 등록만 보고 판단한다.
import { settings } from '@/lib/settings';
import { registerSidecarSaver } from '@/lib/storage/saveTarget';
import { sidecar } from './client';

let registered = false;

export function ensureSidecarSaver(): void {
  if (registered) return;
  registered = true;
  registerSidecarSaver({
    isReady: () => sidecar.isReady(),
    folderName: () => settings.getSidecarFolder() || null,
    async pickFolder() {
      const { path } = await sidecar.pickFolder();
      if (path) settings.setSidecarFolder(path);
      return path || null;
    },
    save: (blob, fileName) => sidecar.saveFile(blob, fileName),
    openFolder: async (path) => { await sidecar.openFolder(path); },
  });
}
