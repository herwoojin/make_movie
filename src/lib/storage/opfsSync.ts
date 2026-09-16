// 워커 전용: SyncAccessHandle 열기. 메인 스레드에서는 이 API가 없다.
import { AppError, toAppError } from '@/lib/errors';

export interface SyncHandle {
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

export async function openSyncHandle(path: string): Promise<SyncHandle> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new AppError('STORAGE_FAILED', `잘못된 경로: ${path}`);
  let dir = await navigator.storage.getDirectory();
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  return (handle as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
}

export function storageWriteError(e: unknown): AppError {
  const err = toAppError(e, 'STORAGE_FAILED');
  return err.code === 'QUOTA_EXCEEDED'
    ? new AppError('QUOTA_EXCEEDED', '브라우저 저장공간이 부족해 파일을 저장하지 못했습니다.', '설정 > 저장공간 정리에서 오래된 프로젝트를 지워보세요')
    : err;
}

export async function writeBytesSync(path: string, bytes: Uint8Array): Promise<number> {
  const sync = await openSyncHandle(path);
  try {
    sync.truncate(0);
    const n = sync.write(bytes, { at: 0 });
    sync.flush();
    return n;
  } catch (e) {
    throw storageWriteError(e);
  } finally {
    sync.close();
  }
}
