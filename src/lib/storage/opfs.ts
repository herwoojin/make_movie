// OPFS(브라우저 전용 파일 시스템) 헬퍼 (ERD 4장). 원본·썸네일·PCM·내보내기 결과 같은 바이너리만 둔다.
import { AppError, toAppError, throwIfAborted } from '@/lib/errors';

export const paths = {
  projectDir: (projectId: string) => `projects/${projectId}`,
  source: (projectId: string, assetId: string, ext: string) => `projects/${projectId}/source/${assetId}.${ext}`,
  pcm: (projectId: string, assetId: string) => `projects/${projectId}/source/${assetId}.pcm`,
  thumb: (projectId: string, timeMs: number) => `projects/${projectId}/thumbs/${String(timeMs).padStart(6, '0')}.webp`,
  tempDir: (projectId: string, jobId: string) => `projects/${projectId}/temp/${jobId}`,
  export: (projectId: string, jobId: string, ext: string) => `projects/${projectId}/exports/${jobId}.${ext}`,
};

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && 'getDirectory' in navigator.storage;
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

async function root(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new AppError('STORAGE_FAILED', '이 브라우저는 영상 보관용 저장소(OPFS)를 지원하지 않습니다.', '데스크톱 Chrome 또는 Edge를 써 주세요. 시크릿 모드에서는 동작하지 않을 수 있습니다.');
  }
  return navigator.storage.getDirectory();
}

/** 중첩 디렉터리 생성 */
export async function ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
  let dir = await root();
  for (const part of split(path)) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

async function getDir(path: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    let dir = await root();
    for (const part of split(path)) dir = await dir.getDirectoryHandle(part);
    return dir;
  } catch {
    return null;
  }
}

export async function getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = split(path);
  const name = parts.pop();
  if (!name) throw new AppError('STORAGE_FAILED', `잘못된 경로: ${path}`);
  const dir = create ? await ensureDir(parts.join('/')) : await getDir(parts.join('/'));
  if (!dir) throw new AppError('NOT_FOUND', '저장된 파일을 찾을 수 없습니다.', '원본 파일을 다시 선택해 연결해 주세요.');
  try {
    return await dir.getFileHandle(name, { create });
  } catch {
    throw new AppError('NOT_FOUND', '저장된 파일을 찾을 수 없습니다.', '원본 파일을 다시 선택해 연결해 주세요.');
  }
}

function wrapWriteError(e: unknown): AppError {
  const err = toAppError(e, 'STORAGE_FAILED');
  if (err.code === 'QUOTA_EXCEEDED') {
    return new AppError('QUOTA_EXCEEDED', '브라우저 저장공간이 부족해 파일을 저장하지 못했습니다.', '설정 > 저장공간 정리에서 오래된 프로젝트를 지워보세요');
  }
  return err;
}

export type WriteSource = Blob | ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;

/**
 * 스트리밍 쓰기. 큰 파일도 메모리에 한 번에 올리지 않는다.
 * 메인 스레드에서는 createWritable(비동기)을 쓰고, 워커 안에서 더 빠른 SyncAccessHandle은 storage.worker가 담당한다.
 */
export async function writeFile(
  path: string, source: WriteSource, onProgress?: (written: number, total?: number) => void, signal?: AbortSignal,
): Promise<number> {
  const handle = await getFileHandle(path, true);
  let writable: FileSystemWritableFileStream | null = null;
  try {
    writable = await handle.createWritable();
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      await writable.write(source as unknown as ArrayBuffer);
      onProgress?.(source.byteLength, source.byteLength);
      await writable.close();
      return source.byteLength;
    }
    const total = source instanceof Blob ? source.size : undefined;
    const reader = (source instanceof Blob ? source.stream() : source).getReader();
    let written = 0;
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value as unknown as ArrayBuffer);
      written += value.byteLength;
      onProgress?.(written, total);
    }
    await writable.close();
    return written;
  } catch (e) {
    await writable?.abort().catch(() => undefined);
    throw wrapWriteError(e);
  }
}

export async function readFile(path: string): Promise<File> {
  const handle = await getFileHandle(path, false);
  return handle.getFile();
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await getFileHandle(path, false);
    return true;
  } catch {
    return false;
  }
}

/** 재귀 삭제. 없으면 조용히 성공 */
export async function deleteDir(path: string): Promise<void> {
  const parts = split(path);
  const name = parts.pop();
  if (!name) return;
  const parent = await getDir(parts.join('/'));
  if (!parent) return;
  try {
    await parent.removeEntry(name, { recursive: true });
  } catch (e) {
    if ((e as { name?: string }).name !== 'NotFoundError') throw toAppError(e, 'STORAGE_FAILED');
  }
}

export const deleteFile = deleteDir;

async function listNames(dir: FileSystemDirectoryHandle): Promise<{ name: string; kind: 'file' | 'directory' }[]> {
  const out: { name: string; kind: 'file' | 'directory' }[] = [];
  for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    out.push({ name, kind: handle.kind });
  }
  return out;
}

/** 디렉터리 전체 용량(바이트). 저장공간 정리 화면용 */
export async function dirSize(path: string): Promise<number> {
  const dir = await getDir(path);
  if (!dir) return 0;
  let total = 0;
  for (const entry of await listNames(dir)) {
    if (entry.kind === 'directory') total += await dirSize(`${path}/${entry.name}`);
    else total += (await (await dir.getFileHandle(entry.name)).getFile()).size;
  }
  return total;
}

/** IndexedDB에 프로젝트 레코드가 없는 OPFS 디렉터리 (삭제 도중 실패한 찌꺼기) */
export async function listOrphans(knownProjectIds?: ReadonlySet<string>): Promise<string[]> {
  const dir = await getDir('projects');
  if (!dir) return [];
  let known = knownProjectIds;
  if (!known) {
    const { getDb } = await import('./db');
    known = new Set(await getDb().projects.toCollection().primaryKeys());
  }
  const ids = known;
  return (await listNames(dir)).filter((e) => e.kind === 'directory' && !ids.has(e.name)).map((e) => e.name);
}
