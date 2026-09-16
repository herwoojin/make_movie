// 대용량 OPFS 쓰기 워커. createSyncAccessHandle은 워커에서만 쓸 수 있고, 비동기 스트림보다 훨씬 빠르다.
import { throwIfAborted } from '@/lib/errors';
import { openSyncHandle, storageWriteError, writeBytesSync } from '@/lib/storage/opfsSync';
import { serve } from '@/lib/worker/serve';

export type StorageWorkerApi = {
  write: { payload: { path: string; file: Blob }; result: { bytes: number } };
  writeBuffer: { payload: { path: string; buffer: ArrayBuffer }; result: { bytes: number } };
};

serve<StorageWorkerApi>({
  async write({ path, file }, { signal, progress }) {
    const sync = await openSyncHandle(path);
    let at = 0;
    try {
      sync.truncate(0);
      const reader = file.stream().getReader();
      for (;;) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        at += sync.write(value, { at });
        progress({ phase: 'write', done: at, total: file.size });
      }
      sync.flush();
      return { result: { bytes: at } };
    } catch (e) {
      throw storageWriteError(e);
    } finally {
      sync.close();
    }
  },

  async writeBuffer({ path, buffer }) {
    const bytes = await writeBytesSync(path, new Uint8Array(buffer));
    return { result: { bytes } };
  },
});
