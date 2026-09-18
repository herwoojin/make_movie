// 최근 저장 결과 (F-11). 도구가 늘어날수록 "방금 만든 그 파일"을 다시 찾기 어려워진다.
import { nanoid } from 'nanoid';
import type { SavedResult, SavedResultKind } from '@/types/models';
import { getDb } from './db';
import { deleteFile, paths, readFile, writeFile } from './opfs';
import { saveResultFile, type SaveOutcome } from './saveTarget';

/** 이 수를 넘으면 정리하라고 알린다 (자동으로 지우지는 않는다) */
export const KEEP_LIMIT = 100;

export interface RecordResultInput {
  blob: Blob;
  fileName: string;
  kind: SavedResultKind;
  toolId: string;
  durationMs?: number;
  projectId?: string;
  thumbnail?: string;
  /** 브라우저 안에도 사본을 남길지 (다시 받기·다시 편집용) */
  keepCopy?: boolean;
}

export async function recordSavedResult(input: RecordResultInput, outcome: SaveOutcome): Promise<SavedResult> {
  const id = `sr-${nanoid(8)}`;
  let opfsPath: string | undefined;
  if (input.keepCopy !== false) {
    try {
      opfsPath = paths.savedResult(id, input.fileName);
      await writeFile(opfsPath, input.blob);
    } catch {
      opfsPath = undefined; // 저장공간이 부족하면 기록만 남긴다
    }
  }
  const row: SavedResult = {
    id,
    kind: input.kind,
    toolId: input.toolId,
    fileName: input.fileName,
    fileSize: input.blob.size,
    durationMs: input.durationMs,
    opfsPath,
    localPath: outcome.localPath,
    thumbnail: input.thumbnail,
    projectId: input.projectId,
    createdAt: Date.now(),
  };
  await getDb().savedResults.put(row);
  return row;
}

/** 결과를 저장하고(3단계) 목록에도 남긴다 */
export async function saveAndRecord(input: RecordResultInput): Promise<{ outcome: SaveOutcome; row: SavedResult }> {
  const outcome = await saveResultFile(input.blob, input.fileName);
  const row = await recordSavedResult(input, outcome);
  return { outcome, row };
}

export async function listSavedResults(): Promise<SavedResult[]> {
  return getDb().savedResults.orderBy('createdAt').reverse().toArray();
}

export async function getSavedBlob(row: SavedResult): Promise<File | null> {
  if (!row.opfsPath) return null;
  return readFile(row.opfsPath).catch(() => null);
}

export async function deleteSavedResult(id: string): Promise<void> {
  const db = getDb();
  const row = await db.savedResults.get(id);
  if (row?.opfsPath) await deleteFile(row.opfsPath).catch(() => undefined);
  await db.savedResults.delete(id);
}

export async function clearOlderThan(keep = KEEP_LIMIT): Promise<number> {
  const rows = await listSavedResults();
  const extra = rows.slice(keep);
  for (const row of extra) await deleteSavedResult(row.id);
  return extra.length;
}
