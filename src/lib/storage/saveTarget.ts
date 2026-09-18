// 결과 파일을 어디에 저장할지 3단계로 고른다 (PRD-v2 F-11).
//   ① 사이드카(내 컴퓨터 도우미)가 켜져 있으면 지정한 폴더에 바로
//   ② Chrome·Edge면 폴더 권한을 한 번 받아 두고 그 폴더에
//   ③ 둘 다 아니면 브라우저 기본 다운로드
import { downloadBlob } from '@/lib/utils';
import { getDb } from './db';

export type SaveMethod = 'sidecar' | 'fs-access' | 'download';

export interface SaveOutcome {
  method: SaveMethod;
  /** 사용자에게 보여줄 위치 (폴더 이름 또는 '다운로드 폴더') */
  location: string;
  /** 사이드카로 저장한 실제 경로 */
  localPath?: string;
}

/** 사이드카 저장은 I 단계에서 등록된다. 없으면 웹 전용으로 조용히 동작한다 */
export interface SidecarSaver {
  isReady(): boolean;
  folderName(): string | null;
  pickFolder(): Promise<string | null>;
  save(blob: Blob, fileName: string): Promise<string>;
  openFolder(path?: string): Promise<void>;
}

let sidecar: SidecarSaver | null = null;
export function registerSidecarSaver(saver: SidecarSaver | null): void {
  sidecar = saver;
}

const HANDLE_ID = 'save-folder';

export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function currentMethod(): SaveMethod {
  if (sidecar?.isReady()) return 'sidecar';
  return supportsFolderPicker() ? 'fs-access' : 'download';
}

async function storedHandle(): Promise<{ handle: FileSystemDirectoryHandle; name: string } | null> {
  try {
    const row = await getDb().fsHandles.get(HANDLE_ID);
    return row ? { handle: row.handle, name: row.name } : null;
  } catch {
    return null;
  }
}

/** 이미 허락받은 폴더인지 (권한 요청은 사용자가 누른 직후에만 가능해서 물어보지 않는다) */
async function hasPermission(handle: FileSystemDirectoryHandle, request = false): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  try {
    const state = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (state === 'granted') return true;
    if (!request) return false;
    return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/** 지금 저장 폴더로 쓰는 곳의 이름 (없으면 null) */
export async function savedFolderName(): Promise<string | null> {
  if (sidecar?.isReady()) return sidecar.folderName();
  const stored = await storedHandle();
  if (!stored) return null;
  return (await hasPermission(stored.handle)) ? stored.name : null;
}

/** 사용자가 폴더를 고른다 (반드시 버튼 클릭 같은 사용자 동작 안에서 호출) */
export async function pickSaveFolder(): Promise<string | null> {
  if (sidecar?.isReady()) return sidecar.pickFolder();
  if (!supportsFolderPicker()) return null;
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await getDb().fsHandles.put({ id: HANDLE_ID, handle, name: handle.name, updatedAt: Date.now() });
  return handle.name;
}

export async function forgetSaveFolder(): Promise<void> {
  await getDb().fsHandles.delete(HANDLE_ID).catch(() => undefined);
}

/**
 * 결과 파일을 저장한다. 폴더 권한이 없거나 실패하면 조용히 다운로드로 내려간다 —
 * "내보내기는 끝났는데 파일이 없다"가 가장 나쁜 결과이기 때문.
 */
export async function saveResultFile(blob: Blob, fileName: string): Promise<SaveOutcome> {
  if (sidecar?.isReady()) {
    try {
      const localPath = await sidecar.save(blob, fileName);
      return { method: 'sidecar', location: localPath, localPath };
    } catch {
      // 사이드카가 중간에 꺼졌을 수 있다 — 아래 단계로 내려간다
    }
  }

  const stored = await storedHandle();
  if (stored && (await hasPermission(stored.handle))) {
    try {
      const file = await stored.handle.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      await blob.stream().pipeTo(writable);
      return { method: 'fs-access', location: stored.name };
    } catch {
      // 권한 만료·디스크 오류 → 다운로드로
    }
  }

  downloadBlob(blob, fileName);
  return { method: 'download', location: '다운로드 폴더' };
}

/** 저장한 폴더를 탐색기로 연다 (사이드카가 있을 때만) */
export async function openSavedFolder(path?: string): Promise<boolean> {
  if (!sidecar?.isReady()) return false;
  await sidecar.openFolder(path);
  return true;
}
